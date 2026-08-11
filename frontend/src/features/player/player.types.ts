/** 전환 분석용. 판정에 쓰이지 않는다(library-api.md 4.4). player는 완료 화면 ▶ 재청취 전용(paywall.md 4.2 예외) */
export type PlayEntryPoint = 'library' | 'explore' | 'miniplayer' | 'push' | 'player';

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

/* ── 플레이어 화면·재생 세션(player.md · player-api.md) ── */

/** 발급(audio-urls) 응답의 콘텐츠 메타(player-api.md 4.1) — 출처 고지(FR-12)의 원천이다 */
export interface PlayerContentMeta {
  id: string;
  title: string;
  authorName: string;
  sourceName: string;
  /** null이면 [원문 보기]를 노출하지 않는다 — 자리도 남기지 않는다(player-uiux.md 4.1) */
  sourceUrl: string | null;
  durationSec: number;
  thumbnailUrl: string;
  /** 재발행 판정용 — 보관값보다 크면 저장 위치를 폐기하고 0부터 재생한다(player.md 7) */
  contentVersion: number;
}

/** POST /contents/:content_id/audio-urls 응답(player-api.md 4.1)의 도메인 모델 */
export interface AudioIssueResult {
  content: PlayerContentMeta;
  /** 라이브러리에 없는 콘텐츠면 null. id는 더보기 삭제, status는 완료 화면 판단에 쓴다 */
  libraryItem: { id: string; status: PlayedLibraryItemStatus } | null;
  progress: PlaybackProgress | null;
  audio: {
    /** 단기 서명 URL — 재생기에 전달하는 용도 외로 보관·기록하지 않는다(player-api.md 7장) */
    url: string;
    expiresAt: string;
    /** 갱신 스케줄링용 상대값 — 기기 시각과 무관하게 수신 시점부터 센다 */
    expiresInSec: number;
  };
}

/** PUT /users/me/playback-progresses/:content_id 응답(player-api.md 4.3)의 도메인 모델 */
export interface ProgressSaveResult {
  positionSec: number;
  maxReachedSec: number;
  contentVersion: number;
  /** 이 저장으로 완청이 판정되면 status: 'completed' — 클라이언트는 판정하지 않는다 */
  libraryItem: {
    id: string;
    status: PlayedLibraryItemStatus;
    completedAt: string | null;
  } | null;
}

/**
 * 재생 세션의 화면 상태(player-uiux.md 2장).
 * - loading: PL2 진입 직후·오디오 준비 중
 * - ready: PL1 재생 중·일시정지
 * - ended: PL3 재생 끝 도달(자동 이탈 없음). 완청(90%) 판정은 서버 몫이라 별개다
 * - load_failed: PL8 로드 실패
 * - withdrawn: PL9 회수
 * - blocked: 발급·재생 시작 시점의 한도 403 — 화면이 닫고 페이월로 전환한다(player-api.md 5장)
 */
export type PlaybackScreenState =
  'loading' | 'ready' | 'ended' | 'load_failed' | 'withdrawn' | 'blocked';

/** 한도 403의 두 갈래(common-error-handling.md 9장) — 페이월인지 안내인지 화면이 가른다 */
export type PlaybackBlockedKind = 'paywall' | 'paid_limit';

/** 컨트롤 아래 배너 자리(player-uiux.md 5장) — 한 곳에 한 종류만 */
export type PlaybackBannerKind = 'network' | 'refresh_failed';

/**
 * 진입 시 목록에서 이미 들고 온 메타(player-uiux.md 4.3 — "메타는 즉시 그린다").
 * 발급 응답이 도착하면 서버 값으로 덮어쓴다.
 */
export interface PlaybackStartMeta {
  title: string;
  authorName?: string;
  sourceName?: string;
  thumbnailUrl?: string;
  durationSec?: number;
}

/** 전역 재생 세션 스냅샷 — PlaybackService가 쓰고 화면·미니플레이어가 구독한다 */
export interface PlaybackSession {
  contentId: string;
  entryPoint: PlayEntryPoint;
  state: PlaybackScreenState;
  /** blocked일 때만. 화면이 페이월/한도 안내로 전환하는 근거다 */
  blocked: { kind: PlaybackBlockedKind; message: string | null } | null;
  /** 발급 전에는 목록 메타의 부분값 — null 필드는 화면에서 자리를 비운다 */
  meta: {
    title: string | null;
    authorName: string | null;
    sourceName: string | null;
    sourceUrl: string | null;
    thumbnailUrl: string | null;
    contentVersion: number | null;
  };
  libraryItem: { id: string; status: PlayedLibraryItemStatus } | null;
  isPlaying: boolean;
  isBuffering: boolean;
  positionSec: number;
  /** 서버가 내려준 콘텐츠 길이(발급 전에는 목록 값). 0이면 미상 — 완청은 폴백 경로다 */
  durationSec: number;
  banner: PlaybackBannerKind | null;
}
