/**
 * 서버 계약 그대로의 DTO(snake_case) — settings-api.md 4장과 1:1이다.
 * 변환(to*)은 settings.api.ts 안에서만 일어난다(convention.md 5.2).
 */

export type PlanStatusDto = 'free' | 'subscribed' | 'cancel_scheduled' | 'grace';
export type SettingsFailedSectionDto = 'account' | 'plan' | 'interest_summary';

export interface SettingsAccountDto {
  email: string | null;
  is_email_verified: boolean;
  is_admin: boolean;
}

/** profile-api.md 4.1의 plan과 같은 모양, 같은 조립 함수다(settings-api.md 4.1) */
export interface SettingsPlanDto {
  status: PlanStatusDto;
  tier: string;
  plan_name: string;
  daily_play_limit: number | null;
  renews_at: string | null;
  expires_at: string | null;
  has_payment_issue: boolean;
  /**
   * 가입 체험(settings-api.md 4.1 — profile-api.md 4.1 "`plan.trial`"과 같은 필드, 2026-10-03). 체험 중이 아니면 null.
   * 선택 필드로 둔다 — 필드를 아직 안 보내는 서버(운영 반영 전)에서는 없을 수 있고, 그때는 null로 읽는다
   */
  trial?: SettingsPlanTrialDto | null;
}

export interface SettingsPlanTrialDto {
  ends_at: string;
  /** 무제한으로 들을 수 있는 마지막 서비스 날짜(YYYY-MM-DD) — ends_at에서 계산하지 않는다 */
  last_free_date: string;
  daily_play_limit_after: number | null;
}

export interface SettingsTopicDto {
  id: string;
  name: string;
}

export interface SettingsInterestSummaryDto {
  count: number;
  top_topics: SettingsTopicDto[];
}

export interface UserSettingsDto {
  default_playback_rate: number;
  is_auto_expand_enabled: boolean;
  is_drip_notification_enabled: boolean;
}

export interface MarketingConsentDto {
  is_agreed: boolean;
  agreed_at: string | null;
}

export interface VersionInfoDto {
  latest_version: string;
  min_supported_version: string;
  update_available: boolean;
}

/** GET /users/me/settings 응답(settings-api.md 4.1) — 섹션 null + failed_sections로 부분 실패 표현 */
export interface SettingsSummaryResponseDto {
  account: SettingsAccountDto | null;
  plan: SettingsPlanDto | null;
  interest_summary: SettingsInterestSummaryDto | null;
  settings: UserSettingsDto;
  marketing_consent: MarketingConsentDto;
  version: VersionInfoDto;
  failed_sections: SettingsFailedSectionDto[];
}

/** PATCH /users/me/settings 요청(settings-api.md 4.2) — 바꿀 필드만 보낸다(최소 1개) */
export interface UpdateSettingsRequestDto {
  default_playback_rate?: number;
  is_auto_expand_enabled?: boolean;
  is_drip_notification_enabled?: boolean;
  client_seq: number;
}

export interface UpdateSettingsResponseDto {
  settings: UserSettingsDto;
  client_seq: number;
}

/** POST /users/me/consents/marketing 요청(settings-api.md 4.3) — consents 이력 행 추가다 */
export interface MarketingConsentRequestDto {
  is_agreed: boolean;
  client_seq: number;
}

export interface MarketingConsentResponseDto {
  marketing_consent: MarketingConsentDto;
  client_seq: number;
}
