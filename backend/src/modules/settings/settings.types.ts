import { AudioQuality } from '@/modules/content/content.enum';
import { InterestSummaryView } from '@/modules/interest/interest.types';
import { PlanView } from '@/modules/subscription/subscription.types';
import { UserSettingView } from '@/modules/user/user.types';

import { SettingsSection } from './settings.enum';

/** convention.md 3.2 — Controller ↔ Orchestrator 경계 밖의 내부 타입 */

/**
 * 계정 섹션(`settings-api.md` 4.1).
 *
 * **닉네임·제공자는 담지 않는다** — 그 표시는 프로필이 담당하고, 설정 화면에는 프로필로
 * 되돌아가는 계정 카드를 두지 않는다(`settings.md` 2장).
 */
export interface SettingsAccountView {
  /** `null`이면 "등록되지 않음". 값이 있는데 미인증이면 "인증되지 않음" 배지다 */
  email: string | null;
  isEmailVerified: boolean;
  /**
   * `users.role = 'admin'` 판정 결과. **[관리자] 메뉴 노출 판단 전용이며 접근 통제가 아니다**
   * (`settings-api.md` 3장 — 관리자 API의 통제는 서버가 요청마다 role로 다시 판정한다).
   */
  isAdmin: boolean;
}

/**
 * 마케팅 수신 동의 상태 — `consents`의 최신 행이다(domain.md 3.2).
 *
 * `settings`와 별도로 두는 이유: **저장소가 다르고 변경 경로도 다르다.** 합쳐 두면 PATCH로
 * 바꿀 수 있다는 오해가 생긴다(`settings-api.md` 3장 설계 메모).
 */
export interface MarketingConsentView {
  isAgreed: boolean;
  /** 최신 행의 시각(동의든 철회든). 행이 없으면 `null` */
  agreedAt: Date | null;
}

/** 버전 안내(`settings-api.md` 4.1). 원천은 테이블이 아니라 배포 설정이다 */
export interface AppVersionView {
  latestVersion: string;
  minSupportedVersion: string;
  /** 요청의 `app_version < latest_version` 판정 결과. **비교를 서버가 한다** */
  updateAvailable: boolean;
}

/**
 * 설정 화면 조회 결과(`settings-api.md` 4.1).
 *
 * **섹션 실패는 `null` + `failedSections`로 표현한다.** `null`만으로는 "값이 없음"
 * (이메일 미등록)과 구분되지 않는다.
 */
export interface SettingsSummaryResult {
  account: SettingsAccountView | null;
  plan: PlanView | null;
  interestSummary: InterestSummaryView | null;
  settings: UserSettingView;
  /**
   * 응답의 `preferred_audio_quality` — 고른 값, 고른 적 없으면 티어가 허용하는 가장 높은 선택지(2026-10-06).
   * `settings.preferredAudioQuality`(원값, null 가능)와 구분한다
   */
  effectiveAudioQuality: AudioQuality;
  /** 음질 선택지(렌더되는 것만 — `aac` 제외)와 이 사용자의 티어가 허용하는지(`settings-api.md` 4.1 — KAN-141). 오름차순 */
  audioQualities: AudioQualityOptionView[];
  marketingConsent: MarketingConsentView;
  version: AppVersionView;
  failedSections: SettingsSection[];
}

export interface AudioQualityOptionView {
  quality: AudioQuality;
  allowed: boolean;
}

/** 설정 값 변경 명령. **보내지 않은 필드는 건드리지 않는다**(`settings-api.md` 4.2) */
export interface UpdateSettingsCommand {
  defaultPlaybackRate?: number;
  isAutoExpandEnabled?: boolean;
  isDripNotificationEnabled?: boolean;
  /** `null` = 고른 적 없음으로 되돌림(자동 — 티어 허용 최고) */
  preferredAudioQuality?: AudioQuality | null;
}
