import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { PLAY_REVIEW_PAGE_SIZE, STORE_API_TIMEOUT_MS } from './voc.constant';
import { ReviewStore } from './voc.enum';
import { StoreReviewFetchError, StoreReviewItem } from './voc.types';

const API_BASE =
  'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';
/** 리뷰 번역 언어 — 외국어 리뷰도 채널에서 바로 읽히게 한국어 번역을 함께 받는다 */
const TRANSLATION_LANGUAGE = 'ko';

/** `reviews.list` 응답에서 우리가 읽는 것. `authorName`은 **읽지 않는다** */
export interface PlayReviewsListResponse {
  reviews?: {
    reviewId?: string;
    /** 받아도 정규화에서 버린다 */
    authorName?: string;
    comments?: {
      userComment?: {
        text?: string;
        originalText?: string;
        lastModified?: { seconds?: string | number; nanos?: number };
        starRating?: number;
        appVersionName?: string;
        reviewerLanguage?: string;
        device?: string;
      };
      developerComment?: unknown;
    }[];
  }[];
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

type GoogleAuthModule = typeof import('google-auth-library');

/**
 * Google 응답 → 공통 모양. 한 리뷰의 `comments`에는 사용자 댓글과 개발자 답글이 섞여 있다 — 사용자 댓글 중
 * 가장 나중에 수정된 것 하나를 본다. 식별자·별점·수정 시각이 없으면 버린다. 텍스트 없는 별점만 리뷰는
 * 애초에 API가 돌려주지 않는다.
 *
 * 번역을 요청했으므로 `text`는 번역문이고 `originalText`가 원문이다 — **원문을 본문으로 쓴다**(번역은 기계
 * 번역이라 뜻이 바뀔 수 있다). 원문이 없으면 `text`.
 */
export function normalizePlayReviews(
  response: PlayReviewsListResponse,
): StoreReviewItem[] {
  return (response.reviews ?? []).flatMap((review) => {
    const latest = (review.comments ?? [])
      .flatMap((comment) => {
        const userComment = comment.userComment;
        const modifiedAt = toDate(userComment?.lastModified?.seconds);

        return userComment && modifiedAt
          ? [{ comment: userComment, modifiedAt }]
          : [];
      })
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())[0];

    if (
      !review.reviewId ||
      !latest ||
      typeof latest.comment.starRating !== 'number'
    ) {
      return [];
    }

    const body =
      latest.comment.originalText?.trim() || latest.comment.text?.trim() || '';

    return [
      {
        store: ReviewStore.PLAY_STORE,
        reviewId: review.reviewId,
        rating: latest.comment.starRating,
        title: null,
        body,
        lastModifiedAt: latest.modifiedAt,
        appVersion: latest.comment.appVersionName?.trim() || null,
        territoryOrLanguage: latest.comment.reviewerLanguage?.trim() || null,
      },
    ];
  });
}

/**
 * Google Play Developer API로 리뷰를 읽는다(KAN-133).
 *
 * `reviews.list`는 **최근 1주일 내 작성·수정된 리뷰만** 돌려준다 — 15분 주기면 놓칠 것이 없고, 1주일 넘게
 * 멈춰 있었다면 그 사이 리뷰는 Play Console에서 본다. 결제 게이트웨이(`billing`)와 같은 서비스 계정·패키지명을
 * 쓰지만 **그 모듈을 import 하지 않는다**(모듈 경계) — 클라이언트는 여기 작게 따로 둔다.
 *
 * `google-auth-library`는 처음 쓸 때 로드한다 — Play 리뷰를 켜지 않은 서버가 그 모듈을 들고 있을 이유가 없다.
 */
@Injectable()
export class PlayReviewClient {
  private readonly packageName: string;
  private readonly serviceAccount: ServiceAccountKey | null;
  private apiClient: InstanceType<GoogleAuthModule['JWT']> | null = null;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    const read = (key: keyof EnvironmentVariables): string =>
      String(configService.get(key, { infer: true }) ?? '').trim();

    this.packageName = read('GOOGLE_PLAY_PACKAGE_NAME');
    this.serviceAccount = parseServiceAccount(
      read('GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64'),
    );
  }

  isEnabled(): boolean {
    return this.packageName !== '' && this.serviceAccount !== null;
  }

  /** 최근 리뷰를 공통 모양으로 돌려준다. 실패는 `StoreReviewFetchError`로 올린다 */
  async fetchRecentReviews(): Promise<StoreReviewItem[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const url =
      `${API_BASE}/${encodeURIComponent(this.packageName)}/reviews` +
      `?maxResults=${PLAY_REVIEW_PAGE_SIZE}&translationLanguage=${TRANSLATION_LANGUAGE}`;

    return normalizePlayReviews(await this.requestJson(url));
  }

  /** HTTP 요청 이음매 — 테스트가 갈아 끼운다. 서비스 계정으로 서명해 보내고 본문을 돌려준다 */
  protected async requestJson(url: string): Promise<PlayReviewsListResponse> {
    try {
      const response =
        await this.getApiClient().request<PlayReviewsListResponse>({
          url,
          method: 'GET',
          timeout: STORE_API_TIMEOUT_MS,
        });

      return response.data;
    } catch (error) {
      throw new StoreReviewFetchError(ReviewStore.PLAY_STORE, statusOf(error));
    }
  }

  private getApiClient(): InstanceType<GoogleAuthModule['JWT']> {
    if (!this.apiClient) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드(클래스 주석)
      const { JWT } = require('google-auth-library') as GoogleAuthModule;

      this.apiClient = new JWT({
        email: this.serviceAccount!.client_email,
        key: this.serviceAccount!.private_key,
        scopes: [ANDROID_PUBLISHER_SCOPE],
      });
    }

    return this.apiClient;
  }
}

function toDate(seconds: string | number | undefined): Date | null {
  if (seconds === undefined || seconds === '') {
    return null;
  }

  const value = Number(seconds);

  return Number.isFinite(value) ? new Date(value * 1000) : null;
}

function parseServiceAccount(base64: string): ServiceAccountKey | null {
  if (base64 === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(base64, 'base64').toString('utf8'),
    ) as Partial<ServiceAccountKey>;

    return typeof parsed.client_email === 'string' &&
      typeof parsed.private_key === 'string'
      ? { client_email: parsed.client_email, private_key: parsed.private_key }
      : null;
  } catch {
    // 값이 깨졌으면 꺼진 것으로 본다 — 기동 요약이 꺼짐을 보여 준다
    return null;
  }
}

/** 자격증명 실패를 뜻하는 상태 — 토큰 발급 주소가 400(`invalid_grant`)으로 답해도 여기로 옮긴다 */
const CREDENTIAL_FAILURE_STATUS = 401;

/**
 * gaxios 오류 → HTTP 상태. 응답이 없었으면 null. Play API가 아닌 주소(토큰 발급)의 오류는 서비스 계정 문제라
 * 자격증명 실패로 올린다 — 결제 게이트웨이와 같은 판단(`google-play-store.gateway.ts`).
 */
export function statusOf(error: unknown): number | null {
  const candidate = error as {
    status?: unknown;
    config?: { url?: unknown };
    response?: { status?: unknown };
  } | null;
  const status = candidate?.response?.status ?? candidate?.status;
  const url = candidate?.config?.url;

  if (typeof status !== 'number') {
    return null;
  }

  const answeredByPlayApi =
    (typeof url === 'string' || url instanceof URL) &&
    url.toString().startsWith(API_BASE);

  return answeredByPlayApi ? status : CREDENTIAL_FAILURE_STATUS;
}
