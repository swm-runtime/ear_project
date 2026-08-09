import type { NavigatorScreenParams } from '@react-navigation/native';

import type { AuthStackParamList } from '@/features/auth';
import type { OnboardingStackParamList } from '@/features/onboarding';

/** 하단 탭 3개 — 라이브러리가 기본이고 설정은 탭이 아니라 프로필 안이다(library.md 2) */
export type MainTabParamList = {
  Library: undefined;
  Explore: undefined;
  Profile: undefined;
};

/** Main 영역 — 탭 위에 얹히는 화면(플레이어 등)은 스택으로 겹친다 */
export type MainStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  /** TODO: player feature 구현 시 교체(player.md). 지금은 플레이스홀더다 */
  Player: { contentId: string };
  /** 설정(settings.md) — 진입점은 프로필 우상단 아이콘뿐이다 */
  Settings: undefined;
  /** TODO: subscription 화면 구현 시 교체(subscription.md) — 플랜 카드·[구독 알아보기]의 목적지 */
  Subscription: undefined;
  /** TODO: 이메일 인증 화면(A 계열, auth.md 4.4~4.5) 구현 시 교체 — [등록]·[인증하기]·[변경] 공통 목적지 */
  EmailVerification: undefined;
  /** TODO: 관심사 관리 화면 구현 시 교체(interest-management.md) */
  InterestManagement: undefined;
  /** TODO: 커리어 정보 화면 구현 시 교체(career.md) — 관심사 관리와 별도 화면이다 */
  Career: undefined;
  /** TODO: 공지사항 인앱 화면 — 명세 작성 후 교체(settings.md 4.1, 합의 2026-08-06) */
  Notice: undefined;
  /** TODO: 탈퇴 화면(A 계열, auth.md 4.3) 구현 시 교체 — 설정 [회원 탈퇴]의 목적지 */
  Withdrawal: undefined;
  /** TODO: 관리자 페이지(admin.md 2장) 구현 시 교체 — 관리자 계정에만 진입점이 노출된다 */
  Admin: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
};

declare global {
  // React Navigation 전역 타이핑(공식 패턴) — useNavigation이 루트 파람을 알게 한다
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
