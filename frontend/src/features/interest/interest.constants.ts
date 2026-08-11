/**
 * 백엔드 관심사 API가 아직 없어 개발 중에는 mock으로 동작한다(api/interest.mock.ts).
 * 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_INTEREST_API=real 로 전환한다.
 */
export const IS_INTEREST_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_INTEREST_API !== 'real';
