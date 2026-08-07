/** 서버 계약의 source 원값 그대로(domain.md 6.1). 배지 라벨 매핑은 copy가 한다 */
export type LibrarySource = 'drip' | 'save' | 'onboarding';

export type LibraryItemStatus = 'unplayed' | 'in_progress' | 'completed';

/**
 * 상단 탭의 전송 값(library-api.md 4.1). 화면 라벨과 전송 값은 분리다 —
 * 라벨은 바뀔 수 있지만 enum은 계약이다.
 * drip은 탭에서 출처 필터로 이동했지만(FE 개편 2026-08-07) 전송 값으로는 유지된다.
 */
export type LibraryFilter = 'all' | 'unplayed' | 'completed' | 'drip';

/**
 * 출처 필터 — 필터 팝업의 "출처" 섹션(이어 PICK / 내가 담은 콘텐츠).
 * save는 사용자가 직접 담은 것(source: save·onboarding)을 묶는다.
 * TODO(계약 제안): library-api.md에는 아직 source_filter 파라미터가 없다 — 백엔드 협의 필요.
 */
export type LibrarySourceFilter = 'drip' | 'save';

export type LibrarySort = 'added_desc' | 'added_asc';

/** 전환 분석용. 판정에 쓰이지 않는다(library-api.md 4.4) */
export type PlayEntryPoint = 'library' | 'explore' | 'miniplayer' | 'push';

export interface LibraryContent {
  id: string;
  title: string;
  authorName: string;
  sourceName: string;
  durationSec: number;
  thumbnailUrl: string;
  /** 재발행 판정용 — 올라갔으면 저장한 위치·오프라인 파일을 폐기한다(domain.md 5.1) */
  contentVersion: number;
  topicIds: string[];
}

export interface LibraryProgress {
  positionSec: number;
  maxReachedSec: number;
}

export interface LibraryItem {
  id: string;
  source: LibrarySource;
  status: LibraryItemStatus;
  addedAt: string;
  lastPlayedAt: string | null;
  completedAt: string | null;
  /** 오늘의 서비스 날짜에 play_records 행이 이미 있는가 — 팝업 여부 힌트(library-api.md 4.1) */
  isCountedToday: boolean;
  content: LibraryContent;
  /** playback_progresses 조인 결과. 행이 없으면 null — 0으로 채우지 않는다 */
  progress: LibraryProgress | null;
}

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

export interface LibraryPage {
  items: LibraryItem[];
  nextCursor: string | null;
  hasNext: boolean;
  playLimit: PlayLimitSnapshot;
}

/** 주제 필터 팝업 항목 — 라이브러리에 실제로 담긴 콘텐츠의 주제(library-api.md 4.2) */
export interface LibraryTopic {
  id: string;
  name: string;
  itemCount: number;
}

export interface ResumeContent {
  id: string;
  title: string;
  durationSec: number;
  thumbnailUrl: string;
  contentVersion: number;
}

/** 미니플레이어 복원 대상(library-api.md 4.3). 항상 일시정지 상태로 표시만 한다 */
export interface ResumeTarget {
  id: string;
  status: LibraryItemStatus;
  lastPlayedAt: string | null;
  isCountedToday: boolean;
  content: ResumeContent;
  progress: LibraryProgress | null;
}

export interface ResumeResult {
  resumeTarget: ResumeTarget | null;
  playLimit: PlayLimitSnapshot;
}

/** POST /contents/:id/play 응답(library-api.md 4.4) */
export interface PlayStartResult {
  /** 이 요청으로 play_records 행이 새로 생겼는가 */
  counted: boolean;
  libraryItem: {
    id: string;
    status: LibraryItemStatus;
    lastPlayedAt: string;
  } | null;
  /** 재생 시작 위치. null이면 0부터 재생한다 */
  progress: LibraryProgress | null;
  /** 적재 이후의 값 — 화면 표시를 이 값으로 덮어쓴다 */
  playLimit: PlayLimitSnapshot;
}
