/**
 * 백엔드 프로필 엔드포인트가 준비될 때까지 mock을 쓴다(CLAUDE.local.md 개발 방식).
 * 실서버 전환: EXPO_PUBLIC_PROFILE_API=real
 */
export const IS_PROFILE_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_PROFILE_API !== 'real';
