import type { LibraryItemStatus, LibrarySource } from '@/features/library';
import type { PlayLimitSnapshot } from '@/features/player';

/** 행의 콘텐츠 — 라이브러리 행과 같은 문법의 표시 정보(explore-api.md 4.1) */
export interface ExploreContent {
  id: string;
  title: string;
  authorName: string;
  sourceName: string;
  /** null이면 E12 [원문 보기]를 노출하지 않는다 — 자리도 남기지 않는다(explore-uiux.md 4.4) */
  sourceUrl: string | null;
  durationSec: number;
  thumbnailUrl: string;
  /** 재발행 판정용(domain.md 5.1) */
  contentVersion: number;
  topicIds: string[];
}

/**
 * 이 콘텐츠의 라이브러리 상태 — 담김 표시와 더보기 시트의 담기/제거 분기에 쓴다.
 * null이면 담기지 않은 상태다(explore-api.md 4.1).
 */
export interface ExploreLibraryState {
  itemId: string;
  source: LibrarySource;
  status: LibraryItemStatus;
}

export interface ExploreItem {
  content: ExploreContent;
  library: ExploreLibraryState | null;
  /** 재생 확인 팝업을 탭 즉시 띄우기 위한 힌트 — 판정이 아니다(library-api.md 4.1과 동일) */
  isCountedToday: boolean;
}

/**
 * 인기 콘텐츠 집계 구간(explore.md 4.1-1) — week·month·all은 전송값이고 화면 라벨은 copy가 가진다.
 * 기본 구간 상수를 클라이언트에 두지 않는다 — 미전송 시 서버가 정하고, 선택 상태는 응답의 period로 그린다.
 */
export type ExplorePeriod = 'week' | 'month' | 'all';

/**
 * 섹션 sectionKey는 분석·로깅용이다 — 화면 분기에 쓰지 않는다(explore-api.md 4.1).
 * union으로 좁히지 않는 이유: 서버가 무배포로 섹션을 추가할 수 있어야 한다(9장 미결).
 *
 * 계약 필드명은 `key`지만 화면 타입에서는 `sectionKey`로 옮긴다 — RN SectionList가 섹션 객체의
 * `key` 필드를 React key로 소비하는 예약 필드라, 스프레드로 흘러들면 topic_group 섹션끼리
 * 키가 충돌한다(2026-08-08 통합 테스트에서 발견). 화면용 유일 키는 explore.section-key.ts가 만든다.
 */
export interface ExploreSection {
  sectionKey: string;
  /** 화면에 그대로 그린다 — 클라이언트가 key로 제목을 조립하지 않는다 */
  title: string;
  /** topic_group 섹션만 값이 있다 */
  topic: { id: string; name: string } | null;
  /**
   * popular 섹션만 값이 있다 — 이 섹션이 어느 구간으로 만들어졌는지이며, 구간 토글의
   * 선택 상태를 그리는 근거다(explore-api.md 4.1). key가 아니라 이 값으로 토글 노출을 가른다.
   */
  period: ExplorePeriod | null;
  items: ExploreItem[];
}

export interface ExploreFeed {
  sections: ExploreSection[];
  /** 라이브러리와 같은 세 필드·같은 규약(explore-api.md 2장) — 피드 조회가 갱신 시점이다 */
  playLimit: PlayLimitSnapshot;
}

export interface ExploreContentsPage {
  items: ExploreItem[];
  nextCursor: string | null;
  hasNext: boolean;
  playLimit: PlayLimitSnapshot;
}

/** 인기 목록 한 페이지(explore-api.md 4.2-1) — period는 서버가 되돌린 값(토글 선택 상태의 근거)이다 */
export interface ExplorePopularPage {
  period: ExplorePeriod;
  items: ExploreItem[];
  nextCursor: string | null;
  hasNext: boolean;
  playLimit: PlayLimitSnapshot;
}

/**
 * 주제 칩 항목 — 정렬은 서버 소유다(explore-api.md 4.2-2). 관심 주제(선택 순서)가 앞쪽이며
 * 클라이언트는 재배열하지 않는다. isInterest는 관심 주제 칩을 시각적으로 구분할 근거다.
 */
export interface ExploreTopic {
  id: string;
  name: string;
  isInterest: boolean;
}

export type SaveReason = 'user_save' | 'auto_play';

/**
 * 담기 응답(explore-api.md 4.3)의 도메인 모델 — libraryItem은 버튼 전환·삭제 호출 재료다.
 * 콘텐츠 상세 화면도 이 계약을 그대로 재사용한다(content-detail-api.md 4.2 — 신규 계약 없음).
 */
export interface SaveContentResult {
  clientSeq: number;
  libraryItem: {
    itemId: string;
    source: LibrarySource;
    status: LibraryItemStatus;
    addedAt: string;
  };
}
