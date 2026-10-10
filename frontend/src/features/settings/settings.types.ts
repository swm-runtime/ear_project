/**
 * 설정 화면 모델(camelCase) — 계약(settings-api.md 4장)의 화면 표현이다.
 */

/**
 * 서버가 정규화한 플랜 4분기 — profile-api.md 4.1의 plan과 같은 모양이다(settings-api.md 4.1).
 * 클라이언트가 expires_at과 기기 시각으로 재판정하지 않는다.
 * 소유는 subscription-api 작성 시 subscription feature로 이관 예정(settings-api.md 9장).
 */
export type PlanStatus = 'free' | 'subscribed' | 'cancel_scheduled' | 'grace';

/** email × isEmailVerified 조합의 세 상태(settings.md 4.1 — profile.md 4.3과 동일 구분) */
export type EmailStatus = 'unregistered' | 'unverified' | 'verified';

/** 서버 허용값(settings-api.md 4.2) — 이 밖의 값은 400이다 */
export type PlaybackRate = 0.8 | 1.0 | 1.2 | 1.5 | 2.0;

/** 음질(domain.md 1.3-1) — 서버 enum 그대로. `aac`는 값만 예약이라 선택지로 오지 않는다 */
export type AudioQuality = 'compressed' | 'aac' | 'lossless';

/** 음질 선택지 한 칸 — 허용 여부는 서버 판정(plans.max_audio_quality)이다. 티어명으로 가르지 않는다 */
export interface AudioQualityOption {
  quality: AudioQuality;
  allowed: boolean;
}

export interface SettingsAccount {
  /** null이면 미등록 — isEmailVerified와 항상 함께 판정한다(settings-api.md 4.1) */
  email: string | null;
  isEmailVerified: boolean;
  /** [관리자] 섹션 노출 판단 전용 — 접근 통제가 아니다(settings-api.md 4.1) */
  isAdmin: boolean;
}

export interface SettingsPlan {
  status: PlanStatus;
  tier: string;
  planName: string;
  /** 무료 요약 "하루 N편"의 N — 서버 값이다. null은 무제한(한도를 적지 않는다) */
  dailyPlayLimit: number | null;
  renewsAt: string | null;
  expiresAt: string | null;
  hasPaymentIssue: boolean;
  /**
   * 가입 체험의 마지막 무제한 날(YYYY-MM-DD) — `plan.trial.last_free_date`. null이면 체험 중이 아니다.
   * 요약 카드는 날짜만 그린다(이후 한도는 프로필·가입 직후 팝업 몫 — profile-uiux.md 4.2·4.11)
   */
  trialLastFreeDate: string | null;
  /** 예약된 요금제 변경(다운그레이드) — 다음 요금제 이름과 적용 시각. 없으면 null */
  pendingPlan: { planName: string; effectiveAt: string } | null;
}

export interface SettingsTopic {
  id: string;
  name: string;
}

export interface SettingsInterestSummary {
  count: number;
  topTopics: SettingsTopic[];
}

/** user_settings 원값(settings-api.md 4.1) — 마케팅 수신 동의는 여기 없다(저장소가 다르다) */
export interface UserSettings {
  defaultPlaybackRate: PlaybackRate;
  /** 주제 자동 확장(FR-06, P1) — 값은 오지만 미구현 동안 화면이 항목을 숨긴다 */
  isAutoExpandEnabled: boolean;
  /** 이어 PICK 알림 앱 토글 — 필드명은 내부 용어를 유지한다(settings-api.md 4.1) */
  isDripNotificationEnabled: boolean;
  /** 적용 중인 음질(settings-api.md 4.1). 필드를 안 보내는 옛 서버면 null — 음질 섹션을 그리지 않는다 */
  preferredAudioQuality: AudioQuality | null;
  /**
   * 음질 선택지(오름차순 + 허용 여부). **조회 응답에만 있다** — 저장(PATCH) 응답에는 없어 null 로 오고,
   * 화면은 조회 캐시의 목록을 그대로 둔다
   */
  audioQualities: AudioQualityOption[] | null;
}

/** consents의 최신 행 — append-only 이력의 현재 상태다(settings-api.md 4.1) */
export interface MarketingConsent {
  isAgreed: boolean;
  agreedAt: string | null;
}

export interface VersionInfo {
  latestVersion: string;
  minSupportedVersion: string;
  /** 판정은 서버가 한다 — 클라이언트가 버전 문자열을 비교하지 않는다(settings-api.md 4.1) */
  updateAvailable: boolean;
}

/**
 * 부분 실패 대상 키(settings-api.md 4.1) — settings·marketing_consent·version이 실패하면
 * 응답 전체가 실패한다(토글 기준값 없이는 낙관적 UI를 시작할 수 없다).
 */
export type SettingsFailedSection = 'account' | 'plan' | 'interest_summary';

export interface SettingsSummary {
  /** null + failedSections에 'account' = 섹션 조회 실패. 관리자 섹션은 노출하지 않는다(안전한 기본값) */
  account: SettingsAccount | null;
  plan: SettingsPlan | null;
  interestSummary: SettingsInterestSummary | null;
  settings: UserSettings;
  marketingConsent: MarketingConsent;
  version: VersionInfo;
  failedSections: SettingsFailedSection[];
}

/** PATCH·동의 POST가 함께 쓰는 낙관적 토글 필드 구분자 — client_seq 관리 단위다 */
export type SettingsToggleField =
  | 'default_playback_rate'
  | 'is_auto_expand_enabled'
  | 'is_drip_notification_enabled'
  | 'preferred_audio_quality'
  | 'marketing_consent';
