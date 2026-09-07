import { apiClient } from '@/shared/api/api-client';

import { IS_WITHDRAWAL_API_MOCKED } from '../auth.constants';
import type { WithdrawalPreview, WithdrawalSubmission } from '../auth.types';
import { mockFetchWithdrawalPreview, mockWithdrawUser } from './withdrawal.mock';

/* ── DTO — auth-api.md 4.6~4.7 계약 그대로 snake_case로 선언한다(convention.md 1.6) ── */

export interface WithdrawalRetainedDto {
  years: number;
  items: string[];
}

export interface WithdrawalPreviewResponseDto {
  has_payment_history: boolean;
  has_active_subscription: boolean;
  subscription_expiry_agreement_required: boolean;
  /** 결제 이력이 없으면 null이다 — 빈 배열이 아닌 이유가 화면 분기다(auth-api.md 4.6) */
  retained: WithdrawalRetainedDto | null;
}

export interface WithdrawUserRequestDto {
  reason_code?: string;
  reason_text?: string;
  confirm: boolean;
  agreed_subscription_expiry?: boolean;
}

/* ── Query Key factory(convention.md 4.1) ── */

export const withdrawalKeys = {
  all: ['withdrawal'] as const,
  /** A7 진입 조회 — 구성(보존 섹션·만료 동의)을 가르는 서버 판정(auth-api.md 4.6) */
  preview: () => [...withdrawalKeys.all, 'preview'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 변환은 이 모듈 안에서만 일어난다 ── */

const toWithdrawalPreview = (dto: WithdrawalPreviewResponseDto): WithdrawalPreview => ({
  hasPaymentHistory: dto.has_payment_history,
  hasActiveSubscription: dto.has_active_subscription,
  subscriptionExpiryAgreementRequired: dto.subscription_expiry_agreement_required,
  retained: dto.retained === null ? null : { years: dto.retained.years, items: dto.retained.items },
});

const toWithdrawUserRequestDto = (model: WithdrawalSubmission): WithdrawUserRequestDto => ({
  // 값이 없으면 키 자체를 싣지 않는다 — 선택 항목에 `undefined`가 남지 않게 한다
  ...(model.reasonCode !== null && { reason_code: model.reasonCode }),
  ...(model.reasonText !== null && { reason_text: model.reasonText }),
  confirm: model.confirm,
  // 활성 구독이 없으면 서버가 요구하지 않는 필드다 — 보내지 않는다(auth-api.md 4.7)
  ...(model.agreedSubscriptionExpiry !== null && {
    agreed_subscription_expiry: model.agreedSubscriptionExpiry,
  }),
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/**
 * 탈퇴 안내 화면의 고지 범위 조회(auth-api.md 4.6).
 * **이 응답은 안내용이다** — 되돌려 보내는 필드가 없고, 서버는 탈퇴 트랜잭션 안에서
 * 같은 판정을 다시 수행한다.
 */
export const fetchWithdrawalPreview = async (): Promise<WithdrawalPreview> => {
  const data = IS_WITHDRAWAL_API_MOCKED
    ? await mockFetchWithdrawalPreview()
    : (await apiClient.get<WithdrawalPreviewResponseDto>('/users/me/withdrawal-preview')).data;
  return toWithdrawalPreview(data);
};

/**
 * 회원 탈퇴(auth-api.md 4.7) — 204. Idempotency-Key 필수이며 **키는 호출자가 시도 단위로
 * 발급**한다(이메일 발송·온보딩 완료와 같은 관례). 자동 재시도 대상이 아니다
 * (common-error-handling.md 4.2 — 회원 탈퇴는 즉시 자동 재시도 금지).
 */
export const withdrawUser = async (input: {
  submission: WithdrawalSubmission;
  idempotencyKey: string;
}): Promise<void> => {
  const body = toWithdrawUserRequestDto(input.submission);
  if (IS_WITHDRAWAL_API_MOCKED) {
    await mockWithdrawUser(body);
    return;
  }
  await apiClient.post('/users/me/withdraw', body, {
    idempotencyKey: input.idempotencyKey,
    noAutoRetry: true,
  });
};
