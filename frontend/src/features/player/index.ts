/**
 * player feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 재생 시작 게이트의 소유자다(architecture.md 5.2) — 라이브러리·탐색·미니플레이어·푸시가
 * 전부 이 게이트를 통과하며, 진입점 feature는 여기서 게이트·팝업·잔여 표시를 가져다 쓴다.
 */
export { default as PlayConfirmDialog } from './components/PlayConfirmDialog';
export { default as RemainingPlaysIndicator } from './components/RemainingPlaysIndicator';
export { usePlayGate } from './hooks/usePlayGate';
export type { PlayGateTarget } from './hooks/usePlayGate';
export {
  hydrateSuppressedServiceDate,
  suppressPlayConfirmForToday,
} from './services/play-confirm-suppression.service';
export { usePlayLimitStore } from './store/play-limit.store';
export type {
  PlaybackProgress,
  PlayEntryPoint,
  PlayLimitSnapshot,
  PlayStartResult,
} from './player.types';

/* ── 잔여 표시값 규약(library-api.md 2) — 목록·복원 응답을 다루는 feature가 재사용한다 ── */
export { toPlaybackProgress, toPlayLimitSnapshot } from './api/player.api';
export type { PlaybackProgressDto, PlayLimitFieldsDto } from './api/player.dto';

/* ── mock 브리지(dev 전용) — 잔여 카운트 상태의 소유자는 player mock 한 곳이다 ── */
export {
  isMockCountedToday,
  mockPlayLimitFields,
  registerPlayMockLibraryBridge,
} from './api/player.mock';
