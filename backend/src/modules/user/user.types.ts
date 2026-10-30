import { AudioQuality } from '@/modules/content/content.enum';
import {
  ConsentType,
  DevicePlatform,
  PreferredLanguage,
  SocialProvider,
  UserMarket,
  WithdrawalReason,
  YearsOfExperienceRange,
} from './user.enum';

import type { User } from './entities/user.entity';

/**
 * convention.md 3.2 — Service 경계에는 HTTP DTO 대신 Command 타입을 쓴다.
 * 모듈 밖으로 공개되는 타입만 이 파일에 둔다.
 */

/**
 * 편성 미리보기(admin)가 읽는 사용자 열 — 편성 계산 입력(`DripPlanUser`) + 화면의 온보딩 완료 여부.
 * 이메일·닉네임 같은 신원·연락처 열은 넣지 않는다(2026-10-22).
 */
export type UserPlanProfile = Pick<
  User,
  | 'id'
  | 'tier'
  | 'market'
  | 'jobCategory'
  | 'yearsOfExperience'
  | 'onboardingCompleted'
  // 가입 시각 — 짧은 판 코호트(KAN-298) 판정 입력. 편성 미리보기가 배치와 같은 후보를 보려면 필요하다
  | 'createdAt'
  // 가입 체험 종료 시각 — 시리즈 유료화(KAN-290) 판정 입력. 미리보기가 배치와 같은 시리즈 편 후보를 보려면 필요하다
  | 'trialEndsAt'
>;

/** 소셜 프로필에서 환산한 계정 생성 입력 (auth.md 4.1) */
/**
 * 클라이언트가 보낸 로케일(`global-api.md` 4.1 `locale`). 전부 선택이다 — 구 앱은 보내지 않는다.
 * `preferredLanguage`는 **계정 생성 때만** 뜻이 있고(시장 판정), 나머지 셋은 가입·로그인·기기 등록마다 갱신한다.
 */
export interface LocaleInput {
  preferredLanguage?: PreferredLanguage | null;
  languageCode?: string | null;
  regionCode?: string | null;
  timezone?: string | null;
}

/** 형식 검증을 거친 저장값 — 모르는 값은 null(`market.policy.ts` normalizeLocale) */
export interface NormalizedLocale {
  languageCode: string | null;
  regionCode: string | null;
  timezone: string | null;
}

export interface CreateUserCommand {
  provider: SocialProvider;
  providerUserId: string;
  /** 마스킹 주소는 null로 들어온다 */
  email: string | null;
  isEmailVerified: boolean;
  /** null = 제공자가 주지 않음. 온보딩에서 채운다 (domain.md 3.1) */
  nickname: string | null;
  /** null = 제공자가 주지 않음 (domain.md 3.1 `profile_image_url`) */
  profileImageUrl: string | null;
  consents: ConsentInput[];
  /** 시장 판정 입력 + 로케일 저장값. 없으면 `kr`·로케일 비움(구 앱) */
  locale?: LocaleInput;
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
  /** 연령 확인 항목에만 — 이 사용자가 확인할 기준 연령(KAN-220). 다른 종류에는 없다 */
  minAge?: number;
}

/**
 * 동의 판정의 대상 — 무엇이 필수인지·현행 버전은 시장이, 연령 확인의 기준 연령은 시장과 기기 지역이 정한다.
 * 가입 전에는 요청 `locale`에서, 가입 후에는 `users` 행(`User`가 그대로 들어간다)에서 온다.
 */
export interface ConsentAudience {
  market: UserMarket;
  regionCode: string | null;
}

/** 가입 시장 판정 결과 — `source`는 로그 근거다(`resolveMarket`) */
export interface SignUpMarket {
  market: UserMarket;
  source: 'preferred' | 'device' | 'default' | 'global_closed';
}

/** 그 `locale`로 가입하면 정해질 시장과 그 시장의 가입 동의 목록 (KAN-215) */
export interface SignUpConsents {
  market: UserMarket;
  requiredConsents: PendingConsent[];
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
 * 커리어 전체 교체 (career-api.md 4.2). 온보딩의 부분 수정과 달리 **세 키가 모두 있어야
 * 한다** — 키 누락을 "유지"로 해석하면 PATCH가 몰래 되살아나 다중 기기 병합 문제가 돌아온다.
 * 비움은 `null`이다.
 */
export interface ReplaceCareerCommand {
  jobCategory: string | null;
  jobTitle: string | null;
  /** 구간 라벨(`"0-1"` 등). 하한값 환산은 Service가 한다 */
  yearsOfExperience: YearsOfExperienceRange | null;
}

/** 커리어 조회·저장 응답의 재료 — 연차는 구간 라벨로 되돌린 값이다 */
export interface CareerView {
  jobCategory: string | null;
  jobTitle: string | null;
  yearsOfExperience: YearsOfExperienceRange | null;
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
  /** 추천 별점 팝업 억제 종료 서비스 날짜(`drip-feedback.md` 4.3). 설정 화면 응답에는 싣지 않는다 */
  dripFeedbackMutedUntil: string | null;
  /** 마지막으로 별점을 물은 편성분의 서비스 날짜(`drip-feedback.md` 4.1). 설정 화면 응답에는 싣지 않는다 */
  dripFeedbackLastPromptedDate: string | null;
  /** 마지막으로 후기를 먼저 물은 서비스 날짜(`content-review.md` 4.3). 설정 화면 응답에는 싣지 않는다 */
  contentReviewLastPromptedDate: string | null;
  /** 후기 먼저 묻기 그만 보기 종료 서비스 날짜(`content-review.md` 4.3). 설정 화면 응답에는 싣지 않는다 */
  contentReviewMutedUntil: string | null;
  /** 사용자가 고른 음질(`player.md` 4.9 — KAN-141). **`null` = 고른 적 없음(티어 허용 최고로 판정)**. 허용 밖 값도 그대로 둔다 — 재생은 서버가 깎는다 */
  preferredAudioQuality: AudioQuality | null;
}

/** 부분 갱신 명령. **보내지 않은 필드는 건드리지 않는다**(`settings-api.md` 4.2) */
export interface UpdateUserSettingCommand {
  defaultPlaybackRate?: number;
  isAutoExpandEnabled?: boolean;
  isDripNotificationEnabled?: boolean;
  dripFeedbackMutedUntil?: string | null;
  dripFeedbackLastPromptedDate?: string | null;
  contentReviewLastPromptedDate?: string | null;
  contentReviewMutedUntil?: string | null;
  /** `null`을 보내면 "고른 적 없음"으로 되돌린다(자동) */
  preferredAudioQuality?: AudioQuality | null;
}
