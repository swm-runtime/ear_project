import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * 루트 내비게이션 ref — 내비게이터 밖(앱 루트의 시트)에서 화면을 열 때만 쓴다. 페이월 시트의
 * "이메일 인증 먼저"(auth.md 4.4 · KAN-120)가 그 경우다. 화면 안에서는 useNavigation 을 쓴다.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
