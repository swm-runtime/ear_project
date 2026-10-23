import type { PlayLimitSnapshot } from '@/features/player';

/**
 * 서버 계약의 source 원값 그대로(domain.md 6.1). 배지 라벨 매핑은 copy가 한다.
 * discovery는 탐험 편성 — "이런 주제는 어떠신가요?" 구분 표시의 판정 재료다
 * (library-api.md 4.1 신설 2026-08-27, 새 필드 없이 이 값 하나로 판정한다).
 */
export type LibrarySource = 'drip' | 'save' | 'onboarding' | 'discovery';

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

/** `queue` 는 재생 목록 패널 전용 — 사용자가 정한 순서(library-api.md 4.1·4.8, KAN-70) */
export type LibrarySort = 'added_desc' | 'added_asc' | 'queue';

export interface LibraryContent {
  id: string;
  title: string;
  /** AI 생성 콘텐츠는 저자가 없다(domain.md 5.1). 표시·검색 모두 null을 건너뛴다 */
  authorName: string | null;
  sourceName: string;
  /** null이면 L4 [원문 보기]를 노출하지 않는다 — 자리도 남기지 않는다(library-uiux.md 4.7) */
  sourceUrl: string | null;
  durationSec: number;
  thumbnailUrl: string;
  /** 재발행 판정용 — 올라갔으면 저장한 위치·오프라인 파일을 폐기한다(domain.md 5.1) */
  contentVersion: number;
  topicIds: string[];
  /** 콘텐츠 언어(BCP 47 primary — `ko` · `en`). 표시 전용 — 이 값으로 거르지 않는다(global-api.md 4.7). 모르면 null */
  language: string | null;
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
 * 목록 렌더 행 — [이어 PICK] 뷰에서만 탐험 구획 헤더가 행으로 끼어든다(library.md 4.6-1).
 * 전체 목록은 item 행뿐이다(구획 없이 시간순 유지 + 행 배지).
 */
export type LibraryListRow = { kind: 'item'; item: LibraryItem } | { kind: 'discoveryHeader' };

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
  topicIds: string[];
  /** 콘텐츠 언어(BCP 47 primary — `ko` · `en`). 표시 전용 — 이 값으로 거르지 않는다(global-api.md 4.7). 모르면 null */
  language: string | null;
}

/** 미니플레이어 복원 대상(library-api.md 4.3). 항상 일시정지 상태로 표시만 한다 */
export interface ResumeTarget {
  /**
   * 라이브러리 항목 id — **담지 않고 듣던 편이면 null**(library-api.md 4.3, BE #1938 — 탐색 재생 자동 적립 폐기 뒤 그런 편도 복원
   * 대상이다). 숨김·삭제 대조는 이 값이 아니라 `content.id` 로 한다(null 끼리 겹치지 않게 — KAN-249)
   */
  id: string | null;
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

/* ── 추천 별점 팝업(drip-feedback.md · drip-feedback-api.md — KAN-224) ── */

/** 콘텐츠 언어 — 표시 전용(drip-feedback-api.md 4.1, 2026-10-14). 이 값으로 거르지 않는다 */
export type DripFeedbackLanguage = 'ko' | 'en';

/** 팝업의 한 편 — `items[]` 순서 그대로 그린다 */
export interface DripFeedbackItem {
  contentId: string;
  title: string;
  /** 비어 오면 null — 썸네일 자리는 면만 남긴다 */
  thumbnailUrl: string | null;
  language: DripFeedbackLanguage;
  source: LibrarySource;
  /** 그 편의 편성 서비스 날짜 라벨(`YYYY-MM-DD`) — 표시·판정에 쓰지 않는다 */
  placedDate: string;
  /** 보조 표시용이지 판정이 아니다(4.1) */
  libraryStatus: LibraryItemStatus;
}

/**
 * 노출 판정 결과(4.1). **클라이언트는 `show`만 본다** — 편성 날짜·이번 주·가입 며칠째를 기기 시각으로 계산하지 않는다.
 * `placedDate`는 닫을 때 `dismiss`에 그대로 되돌리는 값이다(4.3).
 */
export interface DripFeedbackPrompt {
  show: boolean;
  placedDate: string | null;
  mutedUntil: string | null;
  items: DripFeedbackItem[];
}

/** 별점 하나 — 1~5 정수(4.2) */
export interface DripFeedbackRating {
  contentId: string;
  stars: number;
}
