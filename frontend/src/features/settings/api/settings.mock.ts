/**
 * 설정 API mock — 백엔드 엔드포인트가 구현되기 전 화면 테스트용 대역이다.
 * 다른 mock과 같은 관례로, api 모듈 안에서 구현체만 갈아끼운다(DTO를 반환해 변환까지 공통 경로를 지난다).
 *
 * 시나리오 전환(EXPO_PUBLIC_SETTINGS_MOCK_SCENARIO):
 * - (기본)               구독 중·인증 이메일 — S1
 * - free                 무료 플랜(daily_play_limit 3 — 2가 아닌 값으로 하드코딩을 탐지한다) — S2 구독 요약
 * - email-unregistered   email null — S2 계정 섹션
 * - email-unverified     주소 있음 + 미인증 배지 — S3
 * - cancel-scheduled     해지 예약(중립 톤)
 * - grace                결제 문제(경고 톤)
 * - update-available     최신 아님 — S3 업데이트 배지 + [업데이트]
 * - update-android-only  Android만 최신 아님 — platform 파라미터가 실제로 전달·판정에
 *                        쓰이는지 화면에서 검증한다(iOS면 배지 없음, Android면 배지)
 * - admin                관리자 계정 — 리스트 맨 아래 관리자 섹션
 * - marketing-off        마케팅 수신 미동의 상태로 시작
 * - partial-error        account·plan·interest_summary 실패 — S6(상단 카드만 에러, 토글·메뉴는 동작)
 * - full-error           조회 전체 500 — S6 전체(정적 메뉴는 정상 동작)
 * - save-error           PATCH·동의 POST가 500 — S7(원복 + 토스트)
 *
 * OS 권한 상태는 notification feature의 스텁이 소유한다(EXPO_PUBLIC_NOTIFICATION_MOCK_SCENARIO:
 * permission-granted / permission-denied / 기본 미결정) — 유도 배너·S4는 그쪽 env로 전환한다.
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import type { DevicePlatform } from '@/shared/lib/device-platform';

import { getEmailMockAccount } from '@/features/auth';
import { getInterestMockSummary } from '@/features/interest';

import type {
  MarketingConsentDto,
  MarketingConsentRequestDto,
  MarketingConsentResponseDto,
  SettingsAccountDto,
  SettingsPlanDto,
  SettingsSummaryResponseDto,
  UpdateSettingsRequestDto,
  UpdateSettingsResponseDto,
  UserSettingsDto,
} from './settings.dto';

const SCENARIO = process.env.EXPO_PUBLIC_SETTINGS_MOCK_SCENARIO ?? 'default';

/** 스켈레톤 0.3초 규칙(useDelayedVisible)이 실제로 노출되는 지연 — profile mock과 동일 값 */
const RESPONSE_DELAY_MS = 600;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 배속 허용값(settings-api.md 4.2) — 서버 검증의 대역 */
const ALLOWED_PLAYBACK_RATES = [0.8, 1.0, 1.2, 1.5, 2.0];

const internalError = (): ApiError =>
  // 재시도 지연이 없게 retryable=false로 둔다(profile mock과 동일한 태도)
  new ApiError(ERROR_CODES.INTERNAL_ERROR, '일시적인 오류가 발생했어요', false, null, null, 500);

const validationError = (): ApiError =>
  new ApiError(ERROR_CODES.VALIDATION_FAILED, '요청이 올바르지 않아요', false, null, null, 400);

/* ── 저장 상태 — PATCH·동의 POST가 갱신하고 재조회가 같은 값을 돌려준다 ── */

const settingsState: UserSettingsDto = {
  default_playback_rate: 1.0,
  is_auto_expand_enabled: true,
  is_drip_notification_enabled: true,
};

let marketingConsentState: MarketingConsentDto =
  SCENARIO === 'marketing-off'
    ? { is_agreed: false, agreed_at: '2026-07-01T09:00:00Z' }
    : { is_agreed: true, agreed_at: '2026-05-01T09:00:00Z' };

/* ── 시나리오별 조립 ── */

// 이메일 원본은 auth의 email-verification mock 하나다 — 계정 섹션과 인증 화면이 같은
// 상태를 읽어, 인증 성공 후 복귀 시 행 갱신을 함께 본다(career mock과 같은 패턴).
// email-* 시나리오는 원본 대신 고정 변형을 쓴다(EXPO_PUBLIC_EMAIL_VERIFICATION_MOCK_SCENARIO로도
// 같은 상태를 만들 수 있다 — 그쪽은 인증 화면과 상태가 이어진다)
const accountForScenario = (): SettingsAccountDto => {
  const emailAccount = getEmailMockAccount();
  const base: SettingsAccountDto = { ...emailAccount, is_admin: false };
  switch (SCENARIO) {
    case 'email-unregistered':
      return { ...base, email: null, is_email_verified: false };
    case 'email-unverified':
      return { ...base, is_email_verified: false };
    case 'admin':
      return { ...base, is_admin: true };
    default:
      return base;
  }
};

const PLAN_SUBSCRIBED: SettingsPlanDto = {
  status: 'subscribed',
  tier: 'pro',
  plan_name: '프로',
  daily_play_limit: null,
  renews_at: '2026-09-01T00:00:00Z',
  expires_at: null,
  has_payment_issue: false,
};

const planForScenario = (): SettingsPlanDto => {
  switch (SCENARIO) {
    case 'free':
      // 한도를 2가 아닌 값으로 둔다 — 화면이 "하루 2편"을 하드코딩하면 여기서 드러난다(paywall.md 5장)
      return {
        status: 'free',
        tier: 'light',
        plan_name: '무료',
        daily_play_limit: 3,
        renews_at: null,
        expires_at: null,
        has_payment_issue: false,
      };
    case 'cancel-scheduled':
      return {
        ...PLAN_SUBSCRIBED,
        status: 'cancel_scheduled',
        renews_at: null,
        expires_at: '2026-08-31T00:00:00Z',
      };
    case 'grace':
      return { ...PLAN_SUBSCRIBED, status: 'grace', renews_at: null, has_payment_issue: true };
    default:
      return PLAN_SUBSCRIBED;
  }
};

/**
 * 버전 정보는 요청한 platform의 값이다(settings-api.md 4.1, 개정 2026-08-09) —
 * 스토어 심사 주기가 달라 두 플랫폼의 최신 버전이 어긋날 수 있다. update-android-only가
 * 그 어긋난 순간의 대역이다: platform 전달이 누락되면 두 플랫폼이 같은 판정을 받아 드러난다.
 */
const versionForScenario = (platform: DevicePlatform): SettingsSummaryResponseDto['version'] => {
  if (SCENARIO === 'update-available') {
    return { latest_version: '1.4.0', min_supported_version: '1.0.0', update_available: true };
  }
  if (SCENARIO === 'update-android-only') {
    const isBehind = platform === 'android';
    return {
      latest_version: isBehind ? '1.4.0' : '1.0.0',
      min_supported_version: '1.0.0',
      update_available: isBehind,
    };
  }
  return { latest_version: '1.0.0', min_supported_version: '1.0.0', update_available: false };
};

export const mockFetchSettingsSummary = async (
  platform: DevicePlatform,
): Promise<SettingsSummaryResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (SCENARIO === 'full-error') {
    throw internalError();
  }

  const partialFailed = SCENARIO === 'partial-error';

  return {
    account: partialFailed ? null : accountForScenario(),
    plan: partialFailed ? null : planForScenario(),
    // 관심사 원본은 interest mock 하나다 — 설정의 요약 행과 편집 화면이 같은 상태를 읽는다
    interest_summary: partialFailed ? null : getInterestMockSummary(),
    settings: { ...settingsState },
    marketing_consent: { ...marketingConsentState },
    version: versionForScenario(platform),
    failed_sections: partialFailed ? ['account', 'plan', 'interest_summary'] : [],
  };
};

export const mockUpdateSettings = async (
  body: UpdateSettingsRequestDto,
): Promise<UpdateSettingsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (SCENARIO === 'save-error') {
    throw internalError();
  }

  const { client_seq: clientSeq, ...fields } = body;
  // 서버 검증의 대역(settings-api.md 4.2) — 설정 필드 0개·허용 외 배속은 400
  if (Object.keys(fields).length === 0) {
    throw validationError();
  }
  if (
    fields.default_playback_rate !== undefined &&
    !ALLOWED_PLAYBACK_RATES.includes(fields.default_playback_rate)
  ) {
    throw validationError();
  }

  // 보낸 필드만 갱신한다 — 보내지 않은 필드는 건드리지 않는다(settings-api.md 4.2 서버 처리)
  Object.assign(settingsState, fields);

  return { settings: { ...settingsState }, client_seq: clientSeq };
};

export const mockSubmitMarketingConsent = async (
  body: MarketingConsentRequestDto,
): Promise<MarketingConsentResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (SCENARIO === 'save-error') {
    throw internalError();
  }

  // append-only 이력의 대역 — 최신 행이 곧 현재 상태다(settings-api.md 4.3)
  marketingConsentState = { is_agreed: body.is_agreed, agreed_at: new Date().toISOString() };

  return { marketing_consent: { ...marketingConsentState }, client_seq: body.client_seq };
};
