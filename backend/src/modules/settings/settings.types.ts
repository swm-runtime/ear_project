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
  marketingConsent: MarketingConsentView;
  version: AppVersionView;
  failedSections: SettingsSection[];
}

/** 설정 값 변경 명령. **보내지 않은 필드는 건드리지 않는다**(`settings-api.md` 4.2) */
export interface UpdateSettingsCommand {
  defaultPlaybackRate?: number;
  isAutoExpandEnabled?: boolean;
  isDripNotificationEnabled?: boolean;
}
