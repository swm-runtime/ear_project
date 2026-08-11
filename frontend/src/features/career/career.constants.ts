/**
 * 백엔드 커리어 API가 통합 전이라 개발 중에는 mock으로 동작한다(api/career.mock.ts).
 * 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_CAREER_API=real 로 전환한다.
 */
export const IS_CAREER_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_CAREER_API !== 'real';

/**
 * 직무 길이 상한 — 서버 검증 값과 같은 100자다(career-api.md 4.2 · onboarding-api.md 4.4).
 * 입력 차단으로만 적용하고 글자 수 카운터·에러 문구는 두지 않는다(career-uiux.md 4.4).
 */
export const JOB_TITLE_MAX_LENGTH = 100;
