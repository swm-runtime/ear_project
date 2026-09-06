/**
 * 탈퇴 API mock — 계정을 실제로 지우지 않고 A7(안내)·A8(처리 중)을 테스트하는 서버
 * 대역이다. 네트워크를 가로채지 않고 api 모듈 안에서 구현체만 갈아끼운다
 * (withdrawal.api.ts — auth·career·interest와 동일 관례). 앱 리로드 시 상태는 초기화된다.
 *
 * 서버가 트랜잭션 안에서 다시 하는 판정(confirm·만료 동의)을 여기서도 수행한다 —
 * 클라이언트 게이트를 뚫었을 때의 에러 분기까지 화면에서 검증할 수 있게 한다.
 *
 * 시나리오 전환(EXPO_PUBLIC_WITHDRAWAL_MOCK_SCENARIO):
 * - (기본)             결제 이력 있음 + 활성 구독 있음 — A7-a 전체(보존 섹션·스토어 안내·만료 동의)
 * - paid-inactive      결제 이력 있음 + 활성 구독 없음 — 보존 섹션은 그리고 만료 동의는 없음
 * - free               결제 이력 없음 — A7-b(보존 섹션 자체가 없고 "즉시 삭제"만)
 * - load-fail          진입 조회가 첫 1회 실패 — 전체 화면 에러 + [다시 시도] 성공 경로
 * - withdraw-fail      탈퇴 요청이 INTERNAL_ERROR로 실패 — 인라인 에러 + [다시 시도]
 * - archive-missing    WITHDRAWAL_ARCHIVE_IDENTITY_MISSING — 탈퇴 미진행 안내 화면
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type { WithdrawalPreviewResponseDto, WithdrawUserRequestDto } from './withdrawal.api';

const SCENARIO = process.env.EXPO_PUBLIC_WITHDRAWAL_MOCK_SCENARIO ?? 'default';

/** 스켈레톤 0.3초 규칙(useDelayedVisible)이 실제로 노출되는 지연 — 다른 mock과 동일 값 */
const RESPONSE_DELAY_MS = 600;
/** A8(전체 화면 로딩)이 눈에 보이도록 탈퇴는 조금 더 느리게 흉내 낸다 */
const WITHDRAW_DELAY_MS = 1_800;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const hasPaymentHistory = SCENARIO !== 'free';
const hasActiveSubscription = SCENARIO === 'default';

/** load-fail 시나리오 — 첫 호출만 실패시켜 [다시 시도] 성공 경로까지 검증한다 */
let previewFetchFailed = false;

export const mockFetchWithdrawalPreview = async (): Promise<WithdrawalPreviewResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (SCENARIO === 'load-fail' && !previewFetchFailed) {
    previewFetchFailed = true;
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요',
      true,
      null,
      null,
      500,
    );
  }

  return {
    has_payment_history: hasPaymentHistory,
    has_active_subscription: hasActiveSubscription,
    subscription_expiry_agreement_required: hasActiveSubscription,
    // 결제 이력이 없으면 보존 자체가 없다 — 빈 배열이 아니라 null이다(auth-api.md 4.6)
    retained: hasPaymentHistory
      ? { years: 5, items: ['email', 'subscription_history', 'consent_history'] }
      : null,
  };
};

export const mockWithdrawUser = async (body: WithdrawUserRequestDto): Promise<void> => {
  await delay(WITHDRAW_DELAY_MS);

  // 서버와 같은 순서로 판정한다(auth-api.md 4.7 에러 표)
  if (body.confirm !== true) {
    throw new ApiError(
      ERROR_CODES.WITHDRAWAL_CONFIRM_REQUIRED,
      '안내를 확인해주세요',
      false,
      null,
      null,
      400,
    );
  }
  if (hasActiveSubscription && body.agreed_subscription_expiry !== true) {
    throw new ApiError(
      ERROR_CODES.WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED,
      '구독 혜택이 종료되는 것에 동의해주세요',
      false,
      null,
      null,
      400,
    );
  }
  if (SCENARIO === 'archive-missing') {
    throw new ApiError(
      ERROR_CODES.WITHDRAWAL_ARCHIVE_IDENTITY_MISSING,
      '탈퇴를 처리하지 못했어요',
      false,
      null,
      null,
      500,
    );
  }
  if (SCENARIO === 'withdraw-fail') {
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요',
      true,
      null,
      null,
      500,
    );
  }
};
