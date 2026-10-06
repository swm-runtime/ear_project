import { createPrivateKey, KeyObject, sign } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import {
  APP_STORE_CONNECT_TOKEN_TTL_SEC,
  APP_STORE_REVIEW_PAGE_SIZE,
  STORE_API_TIMEOUT_MS,
} from './voc.constant';
import { ReviewStore } from './voc.enum';
import { StoreReviewFetchError, StoreReviewItem } from './voc.types';

const API_BASE = 'https://api.appstoreconnect.apple.com/v1';
/** App Store Connect API JWT의 고정 `aud` */
const APP_STORE_CONNECT_AUDIENCE = 'appstoreconnect-v1';
/** 닉네임(`reviewerNickname`)은 **일부러 요청하지 않는다** — 받지 않으면 흘릴 수도 없다 */
const REVIEW_FIELDS = 'rating,title,body,createdDate,territory';

/** `GET /v1/apps/{id}/customerReviews` 응답에서 우리가 읽는 것 */
export interface AppStoreCustomerReviewsResponse {
  data?: {
    id?: string;
    attributes?: {
      rating?: number;
      title?: string | null;
      body?: string | null;
      createdDate?: string;
      territory?: string | null;
      /** 요청하지 않지만 혹시 와도 정규화에서 버린다 */
      reviewerNickname?: string;
    };
  }[];
}

/** App Store Connect API **팀 키** — 결제용 In-App Purchase 키(`APP_STORE_*`)와 종류가 다르다 */
export interface AppStoreConnectCredentials {
  issuerId: string;
  keyId: string;
  /** PEM(.p8 내용) */
  privateKey: string;
}

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url');

/**
 * App Store Connect API용 ES256 JWT — 헤더 `kid`, 페이로드 `iss`·`aud`·`iat`·`exp`(≤ 20분).
 *
 * `jsonwebtoken`은 직접 의존성이 아니라(결제 라이브러리의 하위 의존) 가져다 쓰지 않고 Node `crypto`로 서명한다.
 * ES256의 JWS 서명은 DER이 아니라 `r||s` 64바이트라 `dsaEncoding: 'ieee-p1363'`이 필요하다.
 * 순수 함수 — `now`를 받아 테스트가 만료 시각을 고정한다.
 */
export function createAppStoreConnectToken(
  credentials: AppStoreConnectCredentials,
  now: Date,
  key: KeyObject = createPrivateKey(credentials.privateKey),
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = { alg: 'ES256', kid: credentials.keyId, typ: 'JWT' };
  const payload = {
    iss: credentials.issuerId,
    iat: issuedAt,
    exp: issuedAt + APP_STORE_CONNECT_TOKEN_TTL_SEC,
    aud: APP_STORE_CONNECT_AUDIENCE,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });

  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Apple 응답 → 공통 모양. 식별자·별점·작성일이 없는 항목은 버린다(알릴 수도 기록할 수도 없다).
 * App Store 리뷰는 수정하면 `createdDate`가 바뀌므로 그 값을 `lastModifiedAt`으로 쓴다.
 * 응답에 앱 버전이 없어 `appVersion`은 항상 null이다.
 */
export function normalizeAppStoreReviews(
  response: AppStoreCustomerReviewsResponse,
): StoreReviewItem[] {
  return (response.data ?? []).flatMap((entry) => {
    const attributes = entry.attributes;
    const createdAt = attributes?.createdDate
      ? new Date(attributes.createdDate)
      : null;

    if (
      !entry.id ||
      typeof attributes?.rating !== 'number' ||
      !createdAt ||
      Number.isNaN(createdAt.getTime())
    ) {
      return [];
    }

    return [
      {
        store: ReviewStore.APP_STORE,
        reviewId: entry.id,
        rating: attributes.rating,
        title: attributes.title?.trim() || null,
        body: attributes.body?.trim() ?? '',
        lastModifiedAt: createdAt,
        appVersion: null,
        territoryOrLanguage: attributes.territory?.trim() || null,
      },
    ];
  });
}

/**
 * App Store Connect API로 고객 리뷰를 읽는다(KAN-133).
 *
 * 날짜 필터가 없어 최신순으로 `APP_STORE_REVIEW_PAGE_SIZE`건만 본다 — 15분에 50건을 넘기는 날이 오면 좋은 일이고,
 * 그때 페이지를 넘기면 된다. 리뷰 웹훅은 Apple이 제공하지 않는다.
 *
 * 자격증명(팀 키 셋)과 앱 Apple ID가 전부 있을 때만 켜진다. 하나라도 비면 조용히 꺼진 상태(로컬 기본).
 */
@Injectable()
export class AppStoreReviewClient {
  private readonly credentials: AppStoreConnectCredentials | null;
  private readonly appAppleId: string;
  private privateKey: KeyObject | null = null;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    const read = (key: keyof EnvironmentVariables): string =>
      String(configService.get(key, { infer: true }) ?? '').trim();

    const issuerId = read('APP_STORE_CONNECT_ISSUER_ID');
    const keyId = read('APP_STORE_CONNECT_KEY_ID');
    const privateKeyBase64 = read('APP_STORE_CONNECT_PRIVATE_KEY_BASE64');
    this.appAppleId = read('APP_STORE_APP_APPLE_ID');
    this.credentials =
      issuerId !== '' && keyId !== '' && privateKeyBase64 !== ''
        ? {
            issuerId,
            keyId,
            privateKey: Buffer.from(privateKeyBase64, 'base64').toString(
              'utf8',
            ),
          }
        : null;
  }

  isEnabled(): boolean {
    return this.credentials !== null && this.appAppleId !== '';
  }

  /** 최신 리뷰를 공통 모양으로 돌려준다. 실패는 `StoreReviewFetchError`로 올린다 — 로그는 호출부가 종류별로 남긴다 */
  async fetchRecentReviews(now: Date): Promise<StoreReviewItem[]> {
    if (!this.credentials || !this.isEnabled()) {
      return [];
    }

    const url =
      `${API_BASE}/apps/${encodeURIComponent(this.appAppleId)}/customerReviews` +
      `?sort=-createdDate&limit=${APP_STORE_REVIEW_PAGE_SIZE}` +
      `&fields[customerReviews]=${encodeURIComponent(REVIEW_FIELDS)}`;
    const token = createAppStoreConnectToken(
      this.credentials,
      now,
      this.loadPrivateKey(this.credentials),
    );

    return normalizeAppStoreReviews(await this.requestJson(url, token));
  }

  /** HTTP 요청 이음매 — 테스트가 갈아 끼운다. 2xx가 아니면 상태를 실은 오류, 응답이 없으면 상태 null */
  protected async requestJson(
    url: string,
    token: string,
  ): Promise<AppStoreCustomerReviewsResponse> {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(STORE_API_TIMEOUT_MS),
      });
    } catch {
      throw new StoreReviewFetchError(ReviewStore.APP_STORE, null);
    }

    if (!response.ok) {
      throw new StoreReviewFetchError(ReviewStore.APP_STORE, response.status);
    }

    return (await response.json()) as AppStoreCustomerReviewsResponse;
  }

  private loadPrivateKey(credentials: AppStoreConnectCredentials): KeyObject {
    if (!this.privateKey) {
      this.privateKey = createPrivateKey(credentials.privateKey);
    }

    return this.privateKey;
  }
}
