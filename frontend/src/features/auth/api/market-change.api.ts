import { apiClient } from '@/shared/api/api-client';

import { IS_AUTH_API_MOCKED } from '../auth.constants';
import type {
  ConsentSubmission,
  ContentLanguage,
  MarketChangeBlockedReason,
  MarketChangePreview,
  MarketChangeResult,
} from '../auth.types';
import {
  toAuthUser,
  toConsentSubmissionDto,
  toMarket,
  toRequiredConsent,
  type ConsentItemDto,
  type ConsentSubmissionDto,
  type UserDto,
} from './auth.api';
import { mockChangeMarket, mockFetchMarketChangePreview } from './auth.mock';

/* ── DTO — global-api.md 4.11 계약 그대로 snake_case로 선언한다(convention.md 1.6) ── */

export interface MarketChangePreviewResponseDto {
  current_market: string;
  target_market: string;
  available: boolean;
  blocked_reason: string | null;
  retry_after_sec: number | null;
  required_consents: ConsentItemDto[];
  steps?: string[];
}

export interface MarketChangeRequestDto {
  preferred_language: ContentLanguage;
  consents: ConsentSubmissionDto[];
}

export interface MarketChangeResponseDto {
  user: UserDto;
  /** 이미 그 시장이면 null — 아무것도 바뀌지 않았다 */
  access_token: string | null;
  access_token_expires_at: string | null;
  onboarding?: { onboarding_completed: boolean; onboarding_step: string; steps: string[] };
}

/* ── Query Key factory(convention.md 4.1) ── */

export const marketChangeKeys = {
  all: ['market-change'] as const,
  preview: (language: ContentLanguage) => [...marketChangeKeys.all, 'preview', language] as const,
};

/* ── 변환 ── */

const toBlockedReason = (value: string | null): MarketChangeBlockedReason | null => {
  if (value === null) return null;
  // 모르는 사유(새 서버)도 "지금은 바꿀 수 없다"로 그린다
  return value === 'cooldown' ? 'cooldown' : 'market_unavailable';
};

const toMarketChangePreview = (dto: MarketChangePreviewResponseDto): MarketChangePreview => ({
  currentMarket: toMarket(dto.current_market),
  targetMarket: toMarket(dto.target_market),
  available: dto.available,
  blockedReason: dto.available
    ? null
    : (toBlockedReason(dto.blocked_reason) ?? 'market_unavailable'),
  retryAfterSec: dto.retry_after_sec,
  requiredConsents: dto.required_consents.map(toRequiredConsent),
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/** 전환 미리보기(global-api.md 4.11) — 아무것도 바꾸지 않는다. 막힘·새 시장의 필수 동의를 서버가 판정한다 */
export const fetchMarketChangePreview = async (
  language: ContentLanguage,
): Promise<MarketChangePreview> => {
  const data = IS_AUTH_API_MOCKED
    ? await mockFetchMarketChangePreview(language)
    : (
        await apiClient.get<MarketChangePreviewResponseDto>('/users/me/market-change/preview', {
          params: { preferred_language: language },
        })
      ).data;
  return toMarketChangePreview(data);
};

/**
 * 시장 전환(global-api.md 4.11) — 한 트랜잭션이다. 자동 재시도하지 않는다(하루 1회 판정이 걸려 있다).
 * 성공하면 응답의 `access_token` 으로 즉시 바꿔야 한다 — 시장이 토큰 클레임이다(호출자 `sessionService.switchMarket`)
 */
export const changeMarket = async (input: {
  language: ContentLanguage;
  consents: ConsentSubmission[];
}): Promise<MarketChangeResult> => {
  const body: MarketChangeRequestDto = {
    preferred_language: input.language,
    consents: input.consents.map(toConsentSubmissionDto),
  };
  const data = IS_AUTH_API_MOCKED
    ? await mockChangeMarket(body)
    : (
        await apiClient.post<MarketChangeResponseDto>('/users/me/market-change', body, {
          noAutoRetry: true,
        })
      ).data;
  return { user: toAuthUser(data.user), accessToken: data.access_token };
};
