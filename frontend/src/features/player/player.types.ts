/** 전환 분석용. 판정에 쓰이지 않는다(library-api.md 4.4) */
export type PlayEntryPoint = 'library' | 'explore' | 'miniplayer' | 'push';

/**
 * 잔여 재생 표시값 — 판정이 아니라 힌트다(library-api.md 2).
 * 허용 여부는 재생 시작 시점에 서버가 다시 판정하며, 이 값을 근거로 재생을 통과시키지 않는다.
 */
export interface PlayLimitSnapshot {
  /** plans.daily_play_limit. null이면 무제한 — 표시 자체를 하지 않는다 */
  dailyPlayLimit: number | null;
  /** 서버가 play_records를 집계한 파생값. 무제한이면 null */
  dailyPlayCount: number | null;
  /** 04:00 KST 경계의 날짜 라벨. 팝업 억제 유효 기간 판정에만 쓴다(library.md 4.3) */
  serviceDate: string;
}

/** playback_progresses 조인 결과(domain.md 6.2). 행이 없으면 null — 0으로 채우지 않는다 */
export interface PlaybackProgress {
  positionSec: number;
  maxReachedSec: number;
}

/** library_items.status의 원값(domain.md 6.1) — 재생 시작 응답이 되비추는 값이다 */
export type PlayedLibraryItemStatus = 'unplayed' | 'in_progress' | 'completed';

/** POST /contents/:id/play 응답(library-api.md 4.4) */
export interface PlayStartResult {
  /** 이 요청으로 play_records 행이 새로 생겼는가 */
  counted: boolean;
  libraryItem: {
    id: string;
    status: PlayedLibraryItemStatus;
    lastPlayedAt: string;
  } | null;
  /** 재생 시작 위치. null이면 0부터 재생한다 */
  progress: PlaybackProgress | null;
  /** 적재 이후의 값 — 화면 표시를 이 값으로 덮어쓴다 */
  playLimit: PlayLimitSnapshot;
}
