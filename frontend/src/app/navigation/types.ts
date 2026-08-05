import type { NavigatorScreenParams } from '@react-navigation/native';

import type { AuthStackParamList } from '@/features/auth';
import type { OnboardingStackParamList } from '@/features/onboarding';

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  /** TODO: MainTab(라이브러리·탐색·프로필) 구현 시 교체 */
  Main: undefined;
};

declare global {
  // React Navigation 전역 타이핑(공식 패턴) — useNavigation이 루트 파람을 알게 한다
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
