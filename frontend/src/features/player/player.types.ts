import type { AudioQuality } from '@/features/settings';

/**
 * 전환 분석용. 판정에 쓰이지 않는다(library-api.md 4.4). player는 완료 화면 ▶ 재청취 전용(paywall.md 4.2 예외).
 * share는 공유 링크 수신 상세의 [재생](share.md 4.3, P1) — library-api.md 4.4 enum에는 아직
 * 없는 **가정 계약**이다(changes/pending 기록 — content-detail-api.md 9장 미결과 함께 백엔드 협의).
 */
export type PlayEntryPoint = 'library' | 'explore' | 'miniplayer' | 'push' | 'player' | 'share';

/**
 * 잔여 재생 표시값 — 판정이 아니라 힌트다(library-api.md 2).
 * 허용 여부는 재생 시작 시점에 서버가 다시 판정하며, 이 값을 근거로 재생을 통과시키지 않는다.
 */
export interface PlayLimitSnapshot {
  /** plans.daily_play_limit. null이면 무제한 — 표시 자체를 하지 않는다 */
  dailyPlayLimit: number | null;
  /** 서버가 play_records를 집계한 파생값. 무제한이면 null */
  dailyPlayCount: number | null;
  /** 05:00 KST 경계의 날짜 라벨. 팝업 억제 유효 기간 판정에만 쓴다(library.md 4.3) */
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
  /**
   * 서버가 내려주는 현재 버전. 저장 요청(player-api.md 4.3)에 그대로 실어 보낸다.
   * 재발행 시 저장된 위치를 폐기할지는 서버가 정한다 — 앱은 위치를 보관하지 않는다
   * (docs/tickets/backend/pending/republish-stale-playback-position.md)
   */
  contentVersion: number;
  /** 콘텐츠 언어(BCP 47 primary — `ko` · `en`). 표시 전용 — 이 값으로 거르지 않는다(global-api.md 4.7). 모르면 null */
  language: string | null;
}

/** 구간이 속한 대본 구역 — `## [인트로]` `## [도입]` `## [본문]` `## [마무리]`(ai/spec/04-script.md) */
export type PlayerSectionKind = 'intro' | 'lead' | 'body' | 'outro';

/** 구간 — 대본의 단락 단위(인트로 · 도입 · 본문 단락 제목 · 마무리). 현재 구간은 `startSec ≤ 재생 위치`인 마지막 항목 */
export interface PlayerSection {
  startSec: number;
  title: string;
  /** 구역. 서버가 안 실었거나 모르는 값이면 null — 구역 라벨 없이 "지금 듣는 구간"으로 그린다 */
  kind: PlayerSectionKind | null;
  /** 구간 요약 한 줄(20자 이내). 서버가 안 실었으면 null — 단락 제목·구역 원래 이름으로 대신한다 */
  summary: string | null;
}

/** POST /contents/:content_id/audio-urls 응답(player-api.md 4.1)의 도메인 모델 */
export interface AudioIssueResult {
  content: PlayerContentMeta;
  /** 발급 응답의 주제(player-api.md 4.1). 서버가 안 실었으면 null — 진입 목록이 넘긴 값을 유지한다 */
  topicIds: string[] | null;
  /** 대본이 적재돼 있는가 — 대본 버튼 노출의 근거다. 조회(4.7)는 패널을 처음 열 때 한다 */
  hasScript: boolean;
  /** 구간 제목(player-api.md 4.1). 없으면 빈 배열 — "지금 듣는 구간" 줄을 그리지 않는다 */
  sections: PlayerSection[];
  /** 라이브러리에 없는 콘텐츠면 null. id는 더보기 삭제, status는 완료 화면 판단에 쓴다 */
  libraryItem: { id: string; status: PlayedLibraryItemStatus } | null;
  progress: PlaybackProgress | null;
  audio: {
    /** 단기 서명 URL — 재생기에 전달하는 용도 외로 보관·기록하지 않는다(player-api.md 7장) */
    url: string;
    expiresAt: string;
    /** 갱신 스케줄링용 상대값 — 기기 시각과 무관하게 수신 시점부터 센다 */
    expiresInSec: number;
    /** 실제로 내준 음질 — 재생 중 갱신에 그대로 되돌려 보낸다. 옛 서버면 null */
    quality: AudioQuality | null;
  };
}

/** PUT /users/me/playback-progresses/:content_id 응답(player-api.md 4.3)의 도메인 모델 */
export interface ProgressSaveResult {
  positionSec: number;
  maxReachedSec: number;
  contentVersion: number;
  /**
   * 서버가 보는 콘텐츠 상태(player-api.md 4.3). **회수 중단의 주 채널이다** —
   * 위치 저장은 재생 중 주기적으로 도는 왕복이라, 파일이 통째로 버퍼링돼 있어도
   * 회수가 저장 주기 안에 반영된다(`partner-control.md` 4.3).
   */
  contentStatus: 'published' | 'withdrawn';
  /** 이 저장으로 완청이 판정되면 status: 'completed' — 클라이언트는 판정하지 않는다 */
  libraryItem: {
    id: string;
    status: PlayedLibraryItemStatus;
    completedAt: string | null;
  } | null;
  /** 서버 완청 판정(BE #1943 — 담지 않은 편 포함). 옛 서버(필드 없음)면 null */
  isCompleted: boolean | null;
}

/**
 * 재생 세션의 화면 상태(player-uiux.md 2장).
 * - loading: PL2 진입 직후·오디오 준비 중
 * - ready: PL1 재생 중·일시정지
 * - ended: PL3 재생 끝 도달(자동 이탈 없음). 완청(90%) 판정은 서버 몫이라 별개다
 * - load_failed: PL8 로드 실패
 * - withdrawn: PL9 회수
 * - blocked: 발급·재생 시작 시점의 한도·잠금 403 — 화면이 닫고 페이월·잠금 시트로 전환한다(player-api.md 5장 · experiments-api.md 4.2-3)
 */
export type PlaybackScreenState =
  'loading' | 'ready' | 'ended' | 'load_failed' | 'withdrawn' | 'blocked';

/**
 * 재생 차단의 갈래 — 한도 403 두 갈래(common-error-handling.md 9장 — 페이월인지 안내인지)와 시리즈 잠긴 편(`SERIES_EPISODE_LOCKED`,
 * experiments-api.md 4.2-3 — KAN-294). 잠금은 한도와 화면이 다르다: 남은 횟수 링 없는 **잠금 시트**(+ 구독 UI 가 켜진 빌드면 요금제)
 */
export type PlaybackBlockedKind = 'paywall' | 'paid_limit' | 'series_locked';

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
  /** 제목 아래 카테고리 표시용(2026-09-16). 목록이 아는 주제 id — 이름은 플레이어가 주제 목록에서 찾는다 */
  topicIds?: string[];
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
    /** 주제 id. 발급 응답의 `content.topics`가 원천이고(player-api.md 4.1), 발급 전에는 진입 목록이 넘긴 값이다 */
    topicIds: string[];
  };
  libraryItem: { id: string; status: PlayedLibraryItemStatus } | null;
  /** 발급 응답의 `has_script`(player-api.md 4.1). 발급 전에는 false — 버튼을 그리지 않는다 */
  hasScript: boolean;
  /** 발급 응답의 구간 제목(player-api.md 4.1, KAN-127). 발급 전·구간 없는 콘텐츠는 빈 배열 */
  sections: PlayerSection[];
  isPlaying: boolean;
  isBuffering: boolean;
  positionSec: number;
  /** 서버가 내려준 콘텐츠 길이(발급 전에는 목록 값). 0이면 미상 — 완청은 폴백 경로다 */
  durationSec: number;
  banner: PlaybackBannerKind | null;
}

/**
 * 스크립트 문단(PL6 — FR-25 P1). 시작·끝 초로 현재 재생 구간을 판정하고, 탭하면 startSec으로 seek한다.
 * 서버 계약은 player-api.md 4.7(`GET /contents/:content_id/script`, KAN-71)이다.
 */
export interface ScriptSegment {
  startSec: number;
  endSec: number;
  /** 화자 표기 — 2인 대화체 대본(ai/PIPELINE.md)이라 문단마다 화자가 있다. 없으면 null */
  speaker: string | null;
  text: string;
}

/**
 * 재생 목록 패널의 한 줄 = 필터 없는 라이브러리 첫 페이지의 항목(2026-09-17 확정).
 * **library의 `LibraryItem`을 그대로 쓰지 않는다** — 타입이라도 player가 library를 가리키면 의존 표
 * (architecture.md 4.4)의 방향이 뒤집힌다. 화면이 실제로 그리는 필드만 추려 여기서 선언하고, 변환은
 * 주입하는 쪽(app/bootstrap)이 맡는다.
 */
/**
 * 재생 목록 패널이 그리는 한 줄(KAN-241) — 라이브러리 항목(`QueueItem`)이거나 탐색 목록 스냅샷의 편이다.
 * `itemId` 가 null 이면 **라이브러리에 없는 편**이다 — 탐색 맥락에서만 생기고, 그 줄에만 담기 버튼이 붙는다
 */
export interface QueueEntry extends Omit<QueueItem, 'itemId'> {
  itemId: string | null;
}

/**
 * 재생 목록의 출처 라벨(KAN-241) — 탐색 맥락 패널의 헤더·손잡이 글자가 된다. 문구는 copy 가 만든다
 * ("주간 인기 콘텐츠" / 섹션·주제·시리즈 이름 / 검색어 — 앞머리 없음)
 */
export type QueueSourceLabel =
  | { type: 'section'; title: string }
  | { type: 'popular'; period: 'week' | 'month' | 'all' }
  | { type: 'topic'; name: string }
  | { type: 'search'; query: string }
  | { type: 'series'; title: string }
  /** 목록이 끝나 자동 재생이 갈아탄 추천 재생 목록(player.md 4.2-4) */
  | { type: 'recommended' };

/**
 * 재생 목록의 정체 = **재생을 시작한 맥락**(player.md 4.2-1, KAN-241 — PM 2026-10-22).
 * - `library`: 종전 그대로 — 필터 없는 라이브러리 첫 페이지(`sort=queue`), 열 때마다 조회, 끌어 순서 변경.
 * - `explore`: 탐색 목록(피드 섹션·주제·인기·검색·시리즈 화면)의 **콘텐츠 행 스냅샷** — 재생 시작 순간 화면이 불러 둔
 *   페이지까지, 서버 순서 그대로. 조회·순서 변경 없음. 아래에 "다음에 들어볼 만한" 추천 블록이 붙는다.
 * 푸시·공유·미니플레이어 복원처럼 맥락을 모르는 진입은 `library` 다. 스토어(메모리)에만 산다 — 앱 재실행 복원은 `library`
 */
export type PlayQueueContext =
  { kind: 'library' } | { kind: 'explore'; source: QueueSourceLabel; items: QueueEntry[] };

export interface QueueItem {
  /** library_items.id */
  itemId: string;
  contentId: string;
  title: string;
  authorName: string | null;
  sourceName: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  /** 오늘 이미 차감됐는가 — 재생 게이트의 확인 팝업 여부 힌트(library-api.md 4.1) */
  isCountedToday: boolean;
  isCompleted: boolean;
  /** 주제 — 이 편을 골라 재생할 때 플레이어의 카테고리 줄이 된다(세션 메타로 넘긴다) */
  topicIds: string[];
  /**
   * 이 사용자에게 잠긴 편인가(서버 `content.is_locked` — experiments-api.md 4.2-2, KAN-294). 표시·자동 재생 멈춤의 힌트일 뿐 판정이
   * 아니다 — 서버가 재생 요청을 다시 판정한다. 없으면(옛 서버·세션에서 만든 줄) 잠기지 않은 것으로 본다
   */
  isLocked?: boolean;
}
