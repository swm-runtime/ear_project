/**
 * 재생 시작(POST /contents/:id/play)은 library-api.md 4.4 계약이라 백엔드 library 통합과
 * 함께 실서버가 열렸다 — 전환 env를 library와 공유한다(EXPO_PUBLIC_LIBRARY_API=real).
 */
export const IS_PLAY_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_LIBRARY_API !== 'real';

/**
 * player 고유 API(서명 URL 발급·위치 저장·replay·원문 클릭 — player-api.md) 전용 전환 env.
 * mock 상태(잔여 카운트·라이브러리 항목)는 library mock과 한 몸이므로 시나리오 env는
 * EXPO_PUBLIC_LIBRARY_MOCK_SCENARIO를 그대로 공유한다.
 */
export const IS_PLAYER_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_PLAYER_API !== 'real';

/** player.md 4.3 — 재생 위치 저장 주기 5초 */
export const PLAYBACK_PROGRESS_SYNC_INTERVAL_MS = 5_000;

/** player.md 4.1 — 버퍼링이 2초를 넘을 때만 재생 버튼 자리에 인디케이터를 띄운다 */
export const BUFFERING_INDICATOR_DELAY_MS = 2_000;

/** player.md 4.2 — 앞뒤 구간 이동 ±10초 통일(확정 2026-08-10). 잠금화면도 같은 값이다 */
export const SEEK_STEP_SEC = 10;

/**
 * 서명 URL 갱신 선행 임계(player-api.md 9장 — 클라이언트 구현 규칙).
 * 만료 60초 전에 백그라운드 갱신을 시작한다. 만료가 60초보다 짧으면 남은 시간의 절반 시점.
 */
export const AUDIO_URL_REFRESH_LEAD_SEC = 60;

/**
 * 연속 도달 판정 허용 간격(player.md 4.4 — 시크 점프는 도달로 치지 않는다).
 * 상태 이벤트 주기 500ms × 최대 배속 2.0 기준 정상 진행은 1초 내외다 — 3초를 넘는
 * 전진·역행은 시크로 간주해 max_reached·청취 시간 적산에서 제외한다.
 */
export const PLAYBACK_CONTINUITY_GAP_SEC = 3;

/** expo-audio 상태 이벤트 주기 — 시크바·시간 라벨 갱신 정밀도의 근거다 */
export const PLAYBACK_STATUS_UPDATE_INTERVAL_MS = 500;

/** library.md 4.5 — 삭제 스낵바 [실행 취소] 5초. 서버 요청은 스낵바 소멸 뒤에 보낸다 */
export const PLAYER_DELETE_UNDO_DURATION_MS = 5_000;

/** player-uiux.md 4.8 — 미니플레이어 종료 스와이프 확정 임계(제안값, 실기기 검증 대상) */
export const MINI_PLAYER_DISMISS_DISTANCE_RATIO = 0.4;
export const MINI_PLAYER_DISMISS_VELOCITY = 0.8; // dp/ms = 800dp/s
/** 수평 이동이 수직의 2배 이상 + 16dp를 넘어야 제스처를 시작한다(세로 스크롤 충돌 방지) */
export const MINI_PLAYER_SWIPE_START_DISTANCE = 16;

/** player-uiux.md 4.8 — 전체 플레이어 아래로 스와이프 축소 임계(제안값) */
export const PLAYER_COLLAPSE_START_DISTANCE = 12;
export const PLAYER_COLLAPSE_DISTANCE_RATIO = 0.2;
export const PLAYER_COLLAPSE_VELOCITY = 0.5; // dp/ms = 500dp/s
