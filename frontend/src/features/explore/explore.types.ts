import type { LibraryItemStatus, LibrarySource } from '@/features/library';
import type { PlayLimitSnapshot } from '@/features/player';

/** 행의 콘텐츠 — 라이브러리 행과 같은 문법의 표시 정보(explore-api.md 4.1) */
export interface ExploreContent {
  id: string;
  title: string;
  authorName: string;
  sourceName: string;
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
 * 섹션 key는 분석·로깅용이다 — 화면 분기에 쓰지 않는다(explore-api.md 4.1).
 * union으로 좁히지 않는 이유: 서버가 무배포로 섹션을 추가할 수 있어야 한다(9장 미결).
 */
export interface ExploreSection {
  key: string;
  /** 화면에 그대로 그린다 — 클라이언트가 key로 제목을 조립하지 않는다 */
  title: string;
  /** topic_group 섹션만 값이 있다 */
  topic: { id: string; name: string } | null;
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

/**
 * 주제 칩 항목 — 서버가 관심 주제를 앞쪽으로 정렬해 내려준다(explore.md 4.2).
 * TODO(계약 제안): explore-api.md에 주제 칩 목록 엔드포인트가 없다 — 백엔드 협의 필요.
 */
export interface ExploreTopic {
  id: string;
  name: string;
  isInterest: boolean;
}

export type SaveReason = 'user_save' | 'auto_play';
