/**
 * 재생 시작(POST /contents/:id/play)은 library-api.md 4.4 계약이라 백엔드 library 통합과
 * 함께 실서버가 열렸다 — 전환 env를 library와 공유한다(EXPO_PUBLIC_LIBRARY_API=real).
 * TODO(player 본개발): 서명 URL 등 player 고유 API가 생기면 EXPO_PUBLIC_PLAYER_API로 분리한다.
 */
export const IS_PLAY_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_LIBRARY_API !== 'real';
