import type { NavigatorScreenParams } from '@react-navigation/native';

import type { AuthStackParamList } from '@/features/auth';

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  /** TODO: onboarding feature 구현 시 파라미터 확정 */
  Onboarding: undefined;
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
