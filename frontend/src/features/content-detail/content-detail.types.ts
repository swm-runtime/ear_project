import type { LibraryItemStatus, LibrarySource } from '@/features/library';

/**
 * 상세 화면을 연 원 화면(content-detail.md 2장). [재생]의 entry_point는 이 값을 그대로
 * 보낸다(content-detail-api.md 4.2 — 원 화면 값 유지. player 진입은 현재 재생 중 콘텐츠라
 * play 호출 자체가 없어 실제로는 library·explore만 나간다).
 */
export type ContentDetailEntryPoint = 'library' | 'explore' | 'player';

/** 출처 영역 분기(content-detail.md 4.3) — 화면 라벨로 노출하지 않는다(uiux 8장 금지) */
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

/**
 * ai_generated의 참고 소스 한 건.
 * ⚠️ 가정 계약 — 백엔드 티켓 확정 대기(tickets/backend/pending/content-sources-structured-list.md).
 * 계약 확정 시 필드명·형태를 맞춘다(content-detail.md 4.3).
 */
export interface ContentDetailSource {
  title: string;
  /** 없으면 제목 한 줄만 표시한다 — "저자 없음"으로 채우지 않는다(content-detail.md 4.3-1) */
  author: string | null;
  /** 없으면 항목이 탭 대상이 아니다 — 목록에서 빼지 않는다(content-detail.md 4.3-1) */
  url: string | null;
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
  series: ContentDetailSeries | null;
  origin: ContentOrigin;
  authorName: string | null;
  /**
   * partner는 제공(파트너명). ai_generated는 고지 문구용 표기 문자열이라 출처 영역에
   * 쓰지 않는다 — 소스 나열은 sources가 담당한다(content-detail-api.md 4.1).
   */
  sourceName: string;
  sourceUrl: string | null;
  /** ai_generated의 참고 소스 전수(⚠️ 가정 계약). partner는 null — api 9장 제안값 */
  sources: ContentDetailSource[] | null;
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
