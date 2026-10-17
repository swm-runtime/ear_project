import type { LibraryItemStatus, LibrarySource } from '@/features/library';

/**
 * 상세 화면을 연 원 화면(content-detail.md 2장). [재생]의 entry_point는 이 값을 그대로
 * 보낸다(content-detail-api.md 4.2 — 원 화면 값 유지. player 진입은 현재 재생 중 콘텐츠라
 * play 호출 자체가 없어 실제로는 library·explore만 나간다).
 *
 * share는 공유 링크 수신(share.md 4.3, P1) — 복귀할 원 화면이 없어 뒤로가기·회수 복귀가
 * 전부 라이브러리로 간다(share-uiux.md 4.4). 서버 entry_point enum에는 아직 없는 가정
 * 계약이다(changes/pending 기록 — 백엔드 협의).
 */
export type ContentDetailEntryPoint = 'library' | 'explore' | 'player' | 'share';

/**
 * 콘텐츠 분류(partner · ai_generated) — 화면 라벨로 노출하지 않는다(uiux 8장 금지).
 * 상세의 출처 영역을 뺀 뒤(KAN-221)로 이 화면이 분기에 쓰지 않는다 — 응답 값으로만 들고 있다.
 */
export type ContentOrigin = 'partner' | 'ai_generated';

export interface ContentDetailTopic {
  id: string;
  name: string;
}

/**
 * 시리즈 정보 — 단일 콘텐츠는 세 필드가 전부 null이라 객체째 null로 내려온다
 * (content-detail-api.md 4.1 — null 판정이 하나가 되게 묶은 모양).
 */
export interface ContentDetailSeries {
  seriesId: string;
  episodeNo: number;
  totalEpisodes: number;
}

export interface ContentDetailContent {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  publishedAt: string;
  thumbnailUrl: string;
  /** 재발행 판정용 — 목록 행·발급 응답과 같은 재료(content-detail-api.md 4.1) */
  contentVersion: number;
  /** 헤더의 주제 태그 — 서버가 내려준 순서 그대로 그린다(재배열 금지) */
  topics: ContentDetailTopic[];
  /** 콘텐츠 해시태그('#' 없이) — 주제(분류)와 별개인 내용 표시. 없으면 빈 배열(KAN-163) */
  tags: string[];
  /** 콘텐츠 언어(BCP 47 primary — `ko` · `en`). 표시 전용 — 이 값으로 거르지 않는다(global-api.md 4.7). 모르면 null */
  language: string | null;
  series: ContentDetailSeries | null;
  origin: ContentOrigin;
  authorName: string | null;
  /** partner는 제공(파트너명), ai_generated는 고지 문구용 표기 문자열 — 플레이어 진입 메타로만 쓴다 */
  sourceName: string;
  /** 상세 화면은 출처를 그리지 않는다(KAN-221) — 응답 값으로만 들고 있다 */
  sourceUrl: string | null;
  // 참고 소스 목록(sources)은 읽지 않는다 — 상세에서 출처 영역을 뺐다(KAN-221). DTO에는 선택 필드로 남아 있다
}

/**
 * 요청자의 라이브러리 상태. null이면 미담김 — 별도 불리언 없이 null 판정 하나로
 * [담기]/[삭제]를 가른다(content-detail-api.md 4.1). id는 [삭제] 호출 재료다.
 */
export interface ContentDetailLibraryItem {
  id: string;
  source: LibrarySource;
  status: LibraryItemStatus;
}

export interface ContentDetail {
  content: ContentDetailContent;
  libraryItem: ContentDetailLibraryItem | null;
  /** 재청취 창 힌트 — [재생] 확인 팝업을 탭 즉시 띄우기 위한 값이며 판정이 아니다 */
  isCountedToday: boolean;
}
