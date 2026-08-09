import {
  ConsentType,
  DevicePlatform,
  SocialProvider,
  WithdrawalReason,
} from './user.enum';

/**
 * convention.md 3.2 — Service 경계에는 HTTP DTO 대신 Command 타입을 쓴다.
 * 모듈 밖으로 공개되는 타입만 이 파일에 둔다.
 */

/** 소셜 프로필에서 환산한 계정 생성 입력 (auth.md 4.1) */
export interface CreateUserCommand {
  provider: SocialProvider;
  providerUserId: string;
  /** 마스킹 주소는 null로 들어온다 */
  email: string | null;
  isEmailVerified: boolean;
  /** null = 제공자가 주지 않음. 온보딩에서 채운다 (domain.md 3.1) */
  nickname: string | null;
  consents: ConsentInput[];
}

export interface ConsentInput {
  consentType: ConsentType;
  version: string | null;
  isAgreed: boolean;
}

export interface WithdrawUserCommand {
  userId: string;
  reasonCode: WithdrawalReason | null;
  reasonText: string | null;
  confirm: boolean;
  agreedSubscriptionExpiry: boolean;
}

export interface ConsentState {
  consentType: ConsentType;
  version: string | null;
  isAgreed: boolean;
  agreedAt: Date;
}

/** 재동의가 필요한 항목 (auth-api.md 4.1 `pending_consents`) */
export interface PendingConsent {
  consentType: ConsentType;
  version: string | null;
  isRequired: boolean;
}

/** 기기 토큰·OS 알림 권한 반영 (onboarding-api.md 4.9) */
export interface RegisterDeviceCommand {
  userId: string;
  deviceId: string;
  /** 권한이 거부되면 null. 발급받지 못한 토큰을 만들어 보내지 않는다 */
  pushToken: string | null;
  platform: DevicePlatform;
  isOsPermissionGranted: boolean;
  appVersion: string;
}

/**
 * 커리어 부분 수정 (onboarding-api.md 4.4).
 * **본문에 없는 필드는 변경하지 않고, `null`을 보낸 필드는 비운다** — PATCH의 기본 의미다.
 * 그래서 "값 없음"을 `undefined`(미전송)와 `null`(비우기)로 구분한다.
 */
export interface UpdateCareerCommand {
  jobCategory?: string | null;
  jobTitle?: string | null;
  /** 구간 enum을 하한값(0 / 2 / 4 / 7)으로 환산한 값 */
  yearsOfExperience?: number | null;
}

/**
 * `user_settings` 조회 결과(domain.md 3.5). **행이 없는 사용자도 기본값으로 채워진 이 모양을
 * 받는다** — 화면이 토글 기준값 없이 낙관적 UI를 시작할 수 없기 때문이다.
 *
 * `sleep_timer_last_choice`는 담지 않는다 — 플레이어 소관이라 설정 경로가 다루지 않는다
 * (`settings-api.md` 8장).
 */
export interface UserSettingView {
  defaultPlaybackRate: number;
  isAutoExpandEnabled: boolean;
  isDripNotificationEnabled: boolean;
}

/** 부분 갱신 명령. **보내지 않은 필드는 건드리지 않는다**(`settings-api.md` 4.2) */
export interface UpdateUserSettingCommand {
  defaultPlaybackRate?: number;
  isAutoExpandEnabled?: boolean;
  isDripNotificationEnabled?: boolean;
}
