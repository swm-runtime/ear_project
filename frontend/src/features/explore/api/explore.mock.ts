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
 * - (기본)  섹션 4개(관심사·신규·인기·주제별) — 담김·회수·필터·페이지네이션 검증
 * - empty   콘텐츠 풀 0건 — E8(피드 비어 있음) 검증
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import {
  getMockLibraryItemByContentId,
  mockSaveLibraryItemByContent,
  mockUnsaveLibraryItemByContent,
} from '@/features/library';
import { isMockCountedToday, mockPlayLimitFields } from '@/features/player';

import type {
  ExploreContentDto,
  ExploreContentsResponseDto,
  ExploreFeedResponseDto,
  ExploreItemDto,
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

/** library mock과 같은 주제 풀 — 관심 주제는 커리어·생산성으로 가정한다 */
const MOCK_TOPICS = [
  { id: 'topic-career', name: '커리어', is_interest: true },
  { id: 'topic-productivity', name: '생산성', is_interest: true },
  { id: 'topic-tech', name: 'IT·테크', is_interest: false },
  { id: 'topic-ai', name: '인공지능', is_interest: false },
  { id: 'topic-psychology', name: '심리', is_interest: false },
  // 콘텐츠 0건 주제 — 골라도 결과가 없는 E9(필터 결과 없음) 검증용. 풀 생성에는 쓰지 않는다
  { id: 'topic-finance', name: '재테크', is_interest: false },
];

/** 콘텐츠 풀 생성에 쓰는 주제 — 재테크(0건 검증용)를 제외한 5개 순환이다(library mock과 동일) */
const POOL_TOPICS = MOCK_TOPICS.slice(0, 5);

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

export const mockFetchFeed = async (): Promise<ExploreFeedResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (SCENARIO === 'empty') {
    return { sections: [], ...mockPlayLimitFields() };
  }

  // 섹션 구성·순서·제목은 서버 제어의 대역이다 — 클라이언트는 이 모양을 그대로 그린다
  const sections: ExploreSectionDto[] = [
    { key: 'interest', title: '관심사에 맞는 추천', topic: null, items: itemsBySeqs([101, 2, 102, 5, 103, 8]) },
    { key: 'new', title: '새로 나온 콘텐츠', topic: null, items: itemsBySeqs([110, 111, 112, 113, 114, 115]) },
    { key: 'popular', title: '지금 인기', topic: null, items: itemsBySeqs([1, 104, 12, 105, 3, 116]) },
    {
      key: 'topic_group',
      title: '커리어',
      topic: { id: 'topic-career', name: '커리어' },
      items: itemsBySeqs([105, 10, 15, 110, 25]),
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

export const mockFetchTopics = async (): Promise<ExploreTopicsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  // 관심 주제를 앞쪽에 — 정렬은 서버 소유의 대역이다(explore.md 4.2)
  const ordered = [
    ...MOCK_TOPICS.filter((t) => t.is_interest),
    ...MOCK_TOPICS.filter((t) => !t.is_interest),
  ];
  return { topics: ordered.map(({ id, name, is_interest }) => ({ id, name, is_interest })) };
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
