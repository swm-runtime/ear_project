/**
 * player feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 재생 시작 게이트·전역 재생(PlaybackService)·미니플레이어의 소유자다(architecture.md 5.1·5.2) —
 * 라이브러리·탐색·미니플레이어·푸시가 전부 게이트를 통과하며, 진입점 feature는 여기서
 * 게이트·팝업·잔여 표시·미니플레이어를 가져다 쓴다.
 */
export { default as PlayerScreen } from './screens/PlayerScreen';
export { default as MiniPlayer } from './components/MiniPlayer';
export type { MiniPlayerResumeFallback } from './components/MiniPlayer';
export { default as PlayConfirmDialog } from './components/PlayConfirmDialog';
export { default as RemainingPlaysIndicator } from './components/RemainingPlaysIndicator';
export { usePlayGate } from './hooks/usePlayGate';
export type { PlayGateTarget } from './hooks/usePlayGate';
export {
  hydrateSuppressedServiceDate,
  suppressPlayConfirmForToday,
} from './services/play-confirm-suppression.service';
export { usePlayLimitStore } from './store/play-limit.store';
/**
 * 재생 세션 구독 전용 — 쓰기는 PlaybackService만 한다(playback.store.ts 규칙). 콘텐츠 상세가
 * "현재 재생 중인 콘텐츠면 새 재생 없이 플레이어 복귀"(content-detail.md 4.4) 판정에 쓴다.
 */
export { usePlaybackStore } from './store/playback.store';
export type {
  PlaybackProgress,
  PlayEntryPoint,
  PlayLimitSnapshot,
  PlayStartResult,
} from './player.types';

/* ── 의존 역전 지점 — app/bootstrap이 library 공개 API로 구현을 주입한다(architecture.md 4.3) ── */
export { registerPlayerLibraryBridge } from './services/player-library.bridge';
export type { PlayerLibraryBridge } from './services/player-library.bridge';

/* ── 잔여 표시값 규약(library-api.md 2) — 목록·복원 응답을 다루는 feature가 재사용한다 ── */
export { toPlaybackProgress, toPlayLimitSnapshot } from './api/player.api';
/** 원문 유입 클릭(player-api.md 4.5) — 세 화면 공용 계약. 콘텐츠 상세가 네 번째 진입점이다 */
export { sendSourceLinkClick } from './api/player.api';
export type { PlaybackProgressDto, PlayLimitFieldsDto } from './api/player.dto';

/* ── mock 브리지(dev 전용) — 잔여 카운트·재생 상태·origin 규칙의 소유자는 player mock 한 곳이다 ── */
export {
  getMockSourceUrl,
  isMockAiGeneratedContent,
  isMockCountedToday,
  mockPlayLimitFields,
  registerPlayMockLibraryBridge,
} from './api/player.mock';
