/**
 * 탐색 API mock — 백엔드 엔드포인트가 구현되기 전 화면 테스트용 대역이다.
 * 라이브러리·온보딩 mock과 같은 관례로, api 모듈 안에서 구현체만 갈아끼운다.
 *
 * 화면 간 정합이 핵심이다:
 * - 잔여 재생 표시값·is_counted_today는 player mock(카운트 상태의 소유자)에서 가져온다
 * - 담김 표시·담기·해제는 library mock 브리지로 실제 라이브러리 mock 상태를 읽고 바꾼다 —
 *   탐색에서 담으면 라이브러리 화면(mock)에도 나타난다(explore.md 완료 조건)
 *
 * 시나리오 전환(EXPO_PUBLIC_EXPLORE_MOCK_SCENARIO):
 * - (기본)         섹션 4개(관심사·신규·인기·주제별) — 담김·회수·필터·페이지네이션 검증
 * - empty          콘텐츠 풀 0건 — E8(피드 비어 있음) 검증
 * - popular-error  인기 구간 전환 실패 — E13 인라인 에러 + [다시 시도] 검증(피드는 정상)
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import {
  getMockLibraryItemByContentId,
  mockSaveLibraryItemByContent,
  mockUnsaveLibraryItemByContent,
} from '@/features/library';
import { getMockSourceUrl, isMockCountedToday, mockPlayLimitFields } from '@/features/player';

import type { ExplorePeriod } from '../explore.types';
import type {
  ExploreContentDto,
  ExploreContentsResponseDto,
  ExploreFeedResponseDto,
  ExploreItemDto,
  ExplorePopularResponseDto,
  ExploreSectionDto,
  ExploreTopicsResponseDto,
  SaveContentRequestDto,
  SaveContentResponseDto,
  UnsaveContentResponseDto,
} from './explore.dto';

const SCENARIO = process.env.EXPO_PUBLIC_EXPLORE_MOCK_SCENARIO ?? 'default';

const RESPONSE_DELAY_MS = 600;
const PAGE_SIZE = 20;

/** 파트너 회수 시뮬레이션 — player mock의 재생 403과 같은 콘텐츠다(content-12) */
const WITHDRAWN_CONTENT_ID = 'content-12';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 주제 칩 목록의 서버 규칙 대역(explore-api.md 4.2-2) — 배열 순서가 곧 응답 순서다.
 * 앞쪽: 활성 관심 주제 전부 — 사용자가 선택한 순서(created_at 오름차순). 숨김 처리돼도 포함한다.
 * 뒤쪽: 그 밖의 노출(is_visible) 주제 — display_order 오름차순.
 */
const INTEREST_TOPICS = [
  { id: 'topic-career', name: '커리어' },
  { id: 'topic-productivity', name: '생산성' },
  // 관리자가 숨긴(is_visible = false) 관심 주제 — 칩에는 그대로 남는다(합의 2026-08-07).
  // 발행 콘텐츠도 0건이라, 골라서 E9가 뜨는 것까지 실서버 전환 전에 확인할 수 있다
  { id: 'topic-mindfulness', name: '마음챙김' },
];
const OTHER_TOPICS = [
  { id: 'topic-tech', name: 'IT·테크' },
  { id: 'topic-ai', name: '인공지능' },
  { id: 'topic-psychology', name: '심리' },
  // 발행 콘텐츠 0건 주제 — 거르지 않고 내려준다. E9(필터 결과 없음) 검증용. 풀 생성에는 쓰지 않는다
  { id: 'topic-finance', name: '재테크' },
];

/** 콘텐츠 풀 생성에 쓰는 주제 — library mock의 5개 순환과 동일해야 content-1~25 메타가 재현된다 */
const POOL_TOPICS = [
  INTEREST_TOPICS[0],
  INTEREST_TOPICS[1],
  OTHER_TOPICS[0],
  OTHER_TOPICS[1],
  OTHER_TOPICS[2],
];

/**
 * 콘텐츠 풀 — content-1~25는 library mock의 초기 항목과 같은 id·메타를 재현해
 * 두 화면에서 같은 콘텐츠로 보이게 한다(제목 생성 규칙을 library.mock과 맞춘 값이다).
 * content-101~118은 탐색에만 노출되는 미담김 콘텐츠다.
 */
const makeContent = (seq: number, exploreOnly: boolean): ExploreContentDto => {
  const topic = POOL_TOPICS[seq % POOL_TOPICS.length];
  return {
    id: `content-${seq}`,
    title: exploreOnly
      ? `${topic.name} 특집 ${seq} — 탐색에서 만나는 이야기`
      : `${topic.name} 이야기 ${seq} — 오래 일하는 사람들의 습관`,
    author_name: `저자 ${seq}`,
    source_name: seq % 2 === 0 ? '폴인' : '롱블랙',
    // origin·source_url 규칙은 player mock 소유다 — 발급·상세와 같은 값이어야 한다
    source_url: getMockSourceUrl(`content-${seq}`),
    duration_sec: 480 + (seq % 5) * 120,
    thumbnail_url: `https://picsum.photos/seed/content-${seq}/200`,
    content_version: 1,
    topic_ids: [topic.id],
  };
};

const CONTENT_POOL: ExploreContentDto[] = [
  ...Array.from({ length: 18 }, (_, i) => makeContent(101 + i, true)),
  ...Array.from({ length: 25 }, (_, i) => makeContent(i + 1, false)),
];

const findContent = (contentId: string): ExploreContentDto | null =>
  CONTENT_POOL.find((c) => c.id === contentId) ?? null;

/** 담김·카운트 상태는 저장하지 않고 매 응답에서 브리지로 다시 읽는다 — 서버 조인의 대역 */
const toItemDto = (content: ExploreContentDto): ExploreItemDto => ({
  content,
  library: getMockLibraryItemByContentId(content.id),
  is_counted_today: isMockCountedToday(content.id),
});

const itemsBySeqs = (seqs: number[]): ExploreItemDto[] =>
  seqs
    .map((seq) => findContent(`content-${seq}`))
    .filter((c): c is ExploreContentDto => c !== null)
    .map(toItemDto);

/**
 * 구간별 인기 목록 — 세 구간이 서로 다른 목록·순서를 내야 토글이 동작하는지 확인할 수 있다.
 * month가 기본 구간이며, 피드의 popular 섹션은 이 목록의 앞부분과 같아야 한다(서버 정합의 대역).
 * month·all은 PAGE_SIZE(20)를 넘겨 추가 로딩(커서)까지 검증한다. content-12(회수 시뮬레이션) 포함.
 */
const POPULAR_SEQS: Record<ExplorePeriod, number[]> = {
  week: [116, 110, 3, 105, 8, 111, 1, 14],
  month: [1, 104, 12, 105, 3, 116, 7, 110, 21, 9, 113, 5, 108, 2, 117, 11, 106, 18, 101, 24, 15, 112],
  all: [
    ...Array.from({ length: 18 }, (_, i) => 101 + i),
    ...Array.from({ length: 25 }, (_, i) => i + 1),
  ],
};

export const mockFetchFeed = async (): Promise<ExploreFeedResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (SCENARIO === 'empty') {
    return { sections: [], ...mockPlayLimitFields() };
  }

  // 섹션 구성·순서·제목은 서버 제어의 대역이다 — 클라이언트는 이 모양을 그대로 그린다
  const sections: ExploreSectionDto[] = [
    { key: 'interest', title: '관심사에 맞는 추천', topic: null, items: itemsBySeqs([101, 2, 102, 5, 103, 8]) },
    { key: 'new', title: '새로 나온 콘텐츠', topic: null, items: itemsBySeqs([110, 111, 112, 113, 114, 115]) },
    {
      key: 'popular',
      title: '지금 인기',
      topic: null,
      // 피드의 인기 섹션은 기본 구간(월간)으로 내려가고 period로 그것을 알린다(explore-api.md 4.1)
      period: 'month',
      items: itemsBySeqs(POPULAR_SEQS.month.slice(0, 6)),
    },
    {
      key: 'topic_group',
      title: '커리어',
      topic: { id: 'topic-career', name: '커리어' },
      items: itemsBySeqs([105, 10, 15, 110, 25]),
    },
    // topic_group을 반드시 2개 이상 둔다 — 같은 key의 섹션이 반복되는 실서버 모양의 재현이며,
    // 섹션 React key 충돌 회귀를 mock에서 잡기 위한 케이스다(2026-08-08 통합 테스트 발견)
    {
      key: 'topic_group',
      title: '생산성',
      topic: { id: 'topic-productivity', name: '생산성' },
      items: itemsBySeqs([106, 1, 111, 16, 21]),
    },
  ];

  return { sections, ...mockPlayLimitFields() };
};

export const mockFetchContents = async (params: {
  topicIds: string[];
  cursor?: string;
}): Promise<ExploreContentsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  // 주제끼리는 OR — "이 중 아무거나"다(explore-api.md 4.2)
  const pool =
    SCENARIO === 'empty'
      ? []
      : CONTENT_POOL.filter((c) => c.topic_ids.some((id) => params.topicIds.includes(id)));

  const startIndex = params.cursor ? pool.findIndex((c) => c.id === params.cursor) + 1 : 0;
  if (params.cursor !== undefined && startIndex === 0) {
    throw new ApiError(
      ERROR_CODES.EXPLORE_CURSOR_INVALID,
      '커서가 유효하지 않아요',
      false,
      null,
      null,
      400,
    );
  }
  const page = pool.slice(startIndex, startIndex + PAGE_SIZE);
  const hasNext = startIndex + PAGE_SIZE < pool.length;

  return {
    items: page.map(toItemDto),
    next_cursor: hasNext ? page[page.length - 1].id : null,
    has_next: hasNext,
    ...mockPlayLimitFields(),
  };
};

export const mockFetchPopular = async (params: {
  period?: ExplorePeriod;
  cursor?: string;
}): Promise<ExplorePopularResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  // 전환 실패 시나리오 — 직전 목록 유지 + 인라인 에러 경로 검증용. 재시도 지연이 없게 retryable=false로 둔다
  if (SCENARIO === 'popular-error') {
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      '일시적인 오류가 발생했어요',
      false,
      null,
      null,
      500,
    );
  }

  // 기본 구간의 소유자는 서버다(explore-api.md 4.2-1) — 미전송 해석은 서버 대역인 여기서만 한다
  const period = params.period ?? 'month';
  const pool =
    SCENARIO === 'empty'
      ? []
      : POPULAR_SEQS[period]
          .map((seq) => findContent(`content-${seq}`))
          .filter((c): c is ExploreContentDto => c !== null);

  const startIndex = params.cursor ? pool.findIndex((c) => c.id === params.cursor) + 1 : 0;
  // 발급 시점과 다른 period의 커서도 여기에 걸린다 — 다른 구간 목록에는 그 id 위치가 없다
  if (params.cursor !== undefined && startIndex === 0) {
    throw new ApiError(
      ERROR_CODES.EXPLORE_CURSOR_INVALID,
      '커서가 유효하지 않아요',
      false,
      null,
      null,
      400,
    );
  }
  const page = pool.slice(startIndex, startIndex + PAGE_SIZE);
  const hasNext = startIndex + PAGE_SIZE < pool.length;

  return {
    period,
    items: page.map(toItemDto),
    next_cursor: hasNext ? page[page.length - 1].id : null,
    has_next: hasNext,
    ...mockPlayLimitFields(),
  };
};

export const mockFetchTopics = async (): Promise<ExploreTopicsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  // 정렬은 서버 소유다(explore-api.md 4.2-2) — 배열이 이미 응답 순서라 여기서 재배열하지 않는다
  return {
    topics: [
      ...INTEREST_TOPICS.map((t) => ({ ...t, is_interest: true })),
      ...OTHER_TOPICS.map((t) => ({ ...t, is_interest: false })),
    ],
  };
};

export const mockSaveContent = async (
  contentId: string,
  body: SaveContentRequestDto,
): Promise<SaveContentResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (contentId === WITHDRAWN_CONTENT_ID) {
    throw new ApiError(
      ERROR_CODES.CONTENT_WITHDRAWN,
      '제공이 종료된 콘텐츠예요',
      false,
      null,
      null,
      403,
    );
  }
  const content = findContent(contentId);
  if (!content) {
    throw new ApiError(
      ERROR_CODES.CONTENT_NOT_FOUND,
      '콘텐츠를 찾을 수 없어요',
      false,
      null,
      null,
      404,
    );
  }

  const result = mockSaveLibraryItemByContent(contentId, {
    title: content.title,
    authorName: content.author_name,
    sourceName: content.source_name,
    durationSec: content.duration_sec,
    topicIds: content.topic_ids,
  });

  return {
    library_item: result.library_item,
    client_seq: body.client_seq,
    ...mockPlayLimitFields(),
  };
};

export const mockUnsaveContent = async (
  contentId: string,
  clientSeq: number,
): Promise<UnsaveContentResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  // 대상이 없어도 200 — 큐 재전송을 실패시키지 않는다(explore-api.md 4.4)
  mockUnsaveLibraryItemByContent(contentId);
  return { client_seq: clientSeq };
};
