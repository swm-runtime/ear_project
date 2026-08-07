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
