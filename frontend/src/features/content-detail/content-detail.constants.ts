/**
 * 백엔드 단건 상세 조회(GET /contents/:content_id)가 아직 없어 개발 중에는 mock으로
 * 동작한다(api/content-detail.mock.ts — content-detail-api.md 9장 "백엔드 미구현").
 * 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_CONTENT_DETAIL_API=real 로 전환한다.
 */
export const IS_CONTENT_DETAIL_API_MOCKED =
  __DEV__ && process.env.EXPO_PUBLIC_CONTENT_DETAIL_API !== 'real';
