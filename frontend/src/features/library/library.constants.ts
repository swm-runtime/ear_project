/**
 * 백엔드 라이브러리 API가 아직 없어 개발 중에는 mock으로 동작한다(api/library.mock.ts).
 * 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_LIBRARY_API=real 로 전환한다.
 */
export const IS_LIBRARY_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_LIBRARY_API !== 'real';

/**
 * 삭제 스낵바 표시 시간. 서버 삭제 요청은 이 시간이 지난 뒤에 보낸다 —
 * 5초 안에 취소하면 서버 호출 자체가 발생하지 않는다(common-error-handling.md 4.4).
 */
export const DELETE_UNDO_DURATION_MS = 5000;
