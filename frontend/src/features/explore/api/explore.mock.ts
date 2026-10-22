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
 *                  검색(4.5)도 이 풀에서 매칭한다 — "이야기"(25건)로 커서 추가 로딩,
 *                  "없는말"로 빈 결과(E7 fallback), "저자 1"로 저자 매칭 검증,
 *                  "#뱅크런"으로 태그 전용 검색(정확 일치), "#뱅크"로 태그 전용 빈 결과, "뱅크"로 태그 부분 일치 검증(KAN-219)
 * - empty          콘텐츠 풀 0건 — E8(피드 비어 있음) 검증
 * - popular-error  인기 구간 전환 실패 — E13 인라인 에러 + [다시 시도] 검증(피드는 정상)
 * - search-error   검색 실패 — 직전 결과 유지 + 상단 배너 검증(피드·초기 화면은 정상)
 * - search-related 키워드 0건 질의에 의미 유사 결과만 오는 응답의 대역(KAN-239 "‘OO’와 관련된 결과예요") — 인기 목록을 빌려 쓴다.
 *                  오타 교정("대신 검색")은 시나리오와 무관하게 기본에서 돈다 — "커리오"(→커리어)·"뱅크론"(→뱅크런)으로 검증
 * - series-off     서버 스위치 `SERIES_EXPLORE_CARDS_ENABLED` 꺼짐의 대역 — 항목에 `type` 키가 없고 시리즈 편이 편마다 한 줄
 *                  (`content.series` 만 붙는다). 기본(켜짐)과 비교해 구버전 서버 모양에서도 깨지지 않는지 본다
 *
 * 시리즈(KAN-225) — 기본 시나리오는 스위치 **켜짐**의 대역이다(explore-api.md 4.1-1): 피드 섹션·주제별·인기·검색(fallback 포함)에
 * 시리즈 카드가 섞이고, 모르는 종류(`type: "playlist"`) 한 건이 새로 나온 콘텐츠 섹션에 끼어 있다(화면에서 빠져야 정상).
 * 시리즈 화면(4.7)은 `series-cs`(6편 계획 중 4편 공개 · 연재 중)·`series-money`(3편 완결). 그 밖의 id 는 404 다
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
  ExploreEntryDto,
  ExploreFeedResponseDto,
  ExploreItemDto,
  ExploreSeriesCardDto,
  ExplorePopularResponseDto,
  ExploreSearchResponseDto,
  RelatedContentsResponseDto,
  ExploreSectionDto,
  ExploreTopicsResponseDto,
  SaveContentRequestDto,
  SaveContentResponseDto,
  SeriesDetailResponseDto,
  SeriesEpisodeDto,
  UnsaveContentResponseDto,
  RestoreSeriesResponseDto,
  SaveSeriesResponseDto,
  UnsaveSeriesResponseDto,
} from './explore.dto';

const SCENARIO = process.env.EXPO_PUBLIC_EXPLORE_MOCK_SCENARIO ?? 'default';
/** 서버 스위치 `SERIES_EXPLORE_CARDS_ENABLED` 의 대역 — 꺼지면 `type` 키도 시리즈 카드도 없다(explore-api.md 4.1-1) */
const IS_SERIES_CARDS_ENABLED = SCENARIO !== 'series-off';

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
/** mock 해시태그 묶음 — 띄어쓰기 없는 2~10자(explore-api.md 4.1) */
const MOCK_TAGS: string[][] = [
  ['협상', '앵커링'],
  ['뱅크런', '예금보험', '금리'],
  ['회의', '결정권', '안건정리', '시간관리'],
];

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
    // 해시태그 — 일부는 비워 "줄 숨김·길이만"을 검증한다(KAN-163)
    tags: seq % 4 === 3 ? [] : MOCK_TAGS[seq % MOCK_TAGS.length],
  };
};

const CONTENT_POOL: ExploreContentDto[] = [
  ...Array.from({ length: 18 }, (_, i) => makeContent(101 + i, true)),
  ...Array.from({ length: 25 }, (_, i) => makeContent(i + 1, false)),
];

/* ── 시리즈(explore-api.md 4.1-1 · 4.7) — 편은 CONTENT_POOL 밖에 둔다: 스위치를 켜면 목록에서 카드로 접히기 때문이다 ── */

interface MockSeries {
  id: string;
  title: string;
  description: string;
  totalEpisodes: number;
  status: 'ongoing' | 'completed';
  /** 노출 중인 편의 seq — 1화부터 차례로. totalEpisodes 보다 적으면 진행 중 시리즈다 */
  episodeSeqs: number[];
  topic: { id: string; name: string };
}

const MOCK_SERIES: MockSeries[] = [
  {
    id: 'series-cs',
    title: '키워드로 빠르게 배우는 CS 지식',
    description:
      '소프트웨어 개발부터 네트워크·운영체제까지, 개발자 면접에 자주 나오는 키워드를 한 편에 하나씩 짚어 봐요.',
    totalEpisodes: 6,
    status: 'ongoing',
    episodeSeqs: [201, 202, 203, 204],
    topic: OTHER_TOPICS[0],
  },
  {
    id: 'series-money',
    title: '사회초년생 돈 공부',
    description: '첫 월급부터 연말정산까지, 처음 겪는 돈 문제를 세 편으로 정리했어요.',
    totalEpisodes: 3,
    status: 'completed',
    episodeSeqs: [211, 212, 213],
    topic: INTEREST_TOPICS[0],
  },
];

const SERIES_EPISODE_SUBTITLES = [
  '소프트웨어를 만드는 방법',
  '프로세스와 스레드',
  '네트워크의 계층',
  '데이터베이스 인덱스',
];

const makeSeriesEpisode = (series: MockSeries, seq: number): ExploreContentDto => {
  const episodeNo = series.episodeSeqs.indexOf(seq) + 1;
  const subtitle = SERIES_EPISODE_SUBTITLES[(episodeNo - 1) % SERIES_EPISODE_SUBTITLES.length];
  return {
    id: `content-${seq}`,
    // 편 제목에 시리즈 이름이 들어 있다 — 시리즈 이름을 따로 보여도 제목을 줄이지 않는다(KAN-225 결정)
    title: `${series.title} ${episodeNo} - ${subtitle}`,
    author_name: null,
    source_name: '이어 스튜디오',
    source_url: getMockSourceUrl(`content-${seq}`),
    duration_sec: 900 + episodeNo * 120,
    thumbnail_url: `https://picsum.photos/seed/content-${seq}/200`,
    content_version: 1,
    topic_ids: [series.topic.id],
    tags: ['CS', '개발'],
    series: {
      id: series.id,
      title: series.title,
      episode_no: episodeNo,
      total_episodes: series.totalEpisodes,
    },
  };
};

const SERIES_EPISODES: ExploreContentDto[] = MOCK_SERIES.flatMap((series) =>
  series.episodeSeqs.map((seq) => makeSeriesEpisode(series, seq)),
);

const findContent = (contentId: string): ExploreContentDto | null =>
  CONTENT_POOL.find((c) => c.id === contentId) ??
  SERIES_EPISODES.find((c) => c.id === contentId) ??
  null;

/** 담김·카운트 상태는 저장하지 않고 매 응답에서 브리지로 다시 읽는다 — 서버 조인의 대역 */
const toItemDto = (content: ExploreContentDto): ExploreItemDto => ({
  // 스위치가 꺼진 서버는 `type` 키를 보내지 않는다 — 없을 때도 콘텐츠 행으로 읽히는지 series-off 로 본다
  ...(IS_SERIES_CARDS_ENABLED ? { type: 'content' as const } : {}),
  content,
  library: getMockLibraryItemByContentId(content.id),
  is_counted_today: isMockCountedToday(content.id),
});

const findSeries = (seriesId: string): MockSeries | null =>
  MOCK_SERIES.find((series) => series.id === seriesId) ?? null;

const toSeriesCardDto = (series: MockSeries): ExploreSeriesCardDto => ({
  type: 'series',
  series: {
    id: series.id,
    title: series.title,
    description: series.description,
    total_episodes: series.totalEpisodes,
    episode_count: series.episodeSeqs.length,
    status: series.status,
    thumbnail_url: `https://picsum.photos/seed/content-${series.episodeSeqs[0]}/200`,
    topic_ids: [series.topic.id],
  },
});

/**
 * 목록 자리에 시리즈를 끼운다 — 켜짐이면 카드 하나, 꺼짐이면 노출 편 전부를 편마다 한 줄로(explore-api.md 4.1-1).
 * `at` 은 카드의 자리(서버의 "시리즈 편 중 가장 앞 편의 자리" 대역)
 */
const withSeries = (
  entries: ExploreEntryDto[],
  seriesId: string,
  at: number,
): ExploreEntryDto[] => {
  const series = findSeries(seriesId);
  if (!series) return entries;
  const inserted: ExploreEntryDto[] = IS_SERIES_CARDS_ENABLED
    ? [toSeriesCardDto(series)]
    : series.episodeSeqs.map((seq) => toItemDto(makeSeriesEpisode(series, seq)));
  return [...entries.slice(0, at), ...inserted, ...entries.slice(at)];
};

/** 목록 항목의 커서 키 — 콘텐츠 행은 content id, 시리즈 카드는 시리즈 id(대역 전용 — 실서버 커서 모양과 무관) */
const entryCursorKey = (entry: ExploreEntryDto): string =>
  entry.type === 'series' ? entry.series.id : entry.content.id;

/**
 * 모르는 항목 종류의 대역 — 서버가 새 `type` 을 더해도 화면이 그 항목만 건너뛰는지 본다(explore-api.md 4.1-1 "모르는 type 은
 * 건너뛴다"). 타입에 없는 모양이라 단언으로 끼운다
 */
const UNKNOWN_ENTRY = {
  type: 'playlist',
  playlist: { id: 'playlist-1', title: '모르는 종류' },
} as unknown as ExploreEntryDto;

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
  month: [
    1, 104, 12, 105, 3, 116, 7, 110, 21, 9, 113, 5, 108, 2, 117, 11, 106, 18, 101, 24, 15, 112,
  ],
  all: [
    ...Array.from({ length: 18 }, (_, i) => 101 + i),
    ...Array.from({ length: 25 }, (_, i) => i + 1),
  ],
};

/** 구간별 인기 목록의 항목 — 월간·전체에는 CS 시리즈가, 주간에는 돈 공부 시리즈가 섞인다 */
const popularEntries = (period: ExplorePeriod): ExploreEntryDto[] => {
  const items = itemsBySeqs(POPULAR_SEQS[period]);
  return withSeries(items, period === 'week' ? 'series-money' : 'series-cs', 1);
};

export const mockFetchFeed = async (): Promise<ExploreFeedResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (SCENARIO === 'empty') {
    return { sections: [], ...mockPlayLimitFields() };
  }

  // 섹션 구성·순서·제목은 서버 제어의 대역이다 — 클라이언트는 이 모양을 그대로 그린다
  // 실서버와 같은 순서 — 인기 섹션이 맨 앞이다(explore.orchestrator.ts, 확정 2026-09-02)
  const sections: ExploreSectionDto[] = [
    {
      key: 'popular',
      title: '지금 인기',
      topic: null,
      // 피드의 인기 섹션은 기본 구간(월간)으로 내려가고 period로 그것을 알린다(explore-api.md 4.1)
      period: 'month',
      // 인기 목록 첫 페이지와 같은 자리 — 대표 카드 줄에 시리즈 카드가 섞인다
      items: popularEntries('month').slice(0, 6),
    },
    {
      key: 'interest',
      title: '관심사에 맞는 추천',
      topic: null,
      items: itemsBySeqs([101, 2, 102, 5, 103, 8]),
    },
    {
      key: 'new',
      title: '새로 나온 콘텐츠',
      topic: null,
      // 시리즈 카드 + 모르는 종류 한 건(켜짐) — 모르는 종류는 화면에서 빠져야 한다
      items: [
        ...withSeries(itemsBySeqs([110, 111, 112, 113, 114, 115]), 'series-money', 0),
        ...(IS_SERIES_CARDS_ENABLED ? [UNKNOWN_ENTRY] : []),
      ],
    },
    {
      key: 'topic_group',
      title: '커리어',
      topic: { id: 'topic-career', name: '커리어' },
      // 같은 시리즈가 섹션마다 따로 접혀 두 섹션에 각각 나온다(explore-api.md 4.1-1)
      items: withSeries(itemsBySeqs([105, 10, 15, 110, 25]), 'series-money', 1),
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

  // 주제끼리는 OR — "이 중 아무거나"다(explore-api.md 4.2). 시리즈는 편 단위로 걸고 카드 하나로 접는다(4.1-1)
  const matches = (topicIds: string[]) => topicIds.some((id) => params.topicIds.includes(id));
  const pool =
    SCENARIO === 'empty'
      ? []
      : MOCK_SERIES.filter((series) => matches([series.topic.id])).reduce(
          (entries, series) => withSeries(entries, series.id, 0),
          CONTENT_POOL.filter((c) => matches(c.topic_ids)).map(toItemDto) as ExploreEntryDto[],
        );

  const startIndex = params.cursor
    ? pool.findIndex((entry) => entryCursorKey(entry) === params.cursor) + 1
    : 0;
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
    items: page,
    next_cursor: hasNext ? entryCursorKey(page[page.length - 1]) : null,
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
  const pool = SCENARIO === 'empty' ? [] : popularEntries(period);

  const startIndex = params.cursor
    ? pool.findIndex((entry) => entryCursorKey(entry) === params.cursor) + 1
    : 0;
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
    items: page,
    next_cursor: hasNext ? entryCursorKey(page[page.length - 1]) : null,
    has_next: hasNext,
    ...mockPlayLimitFields(),
  };
};

/** 매칭 전 정규화의 서버 대역(explore.md 4.5-5) — NFC + 소문자. 실제 정규화 주체는 서버다 */
const normalizeForSearch = (text: string): string => text.normalize('NFC').toLowerCase();

const topicNamesOf = (content: ExploreContentDto): string[] =>
  content.topic_ids
    .map((id) => [...INTEREST_TOPICS, ...OTHER_TOPICS].find((t) => t.id === id)?.name)
    .filter((name): name is string => name !== undefined);

/** 태그 전용 검색의 접두(explore.md 4.5-2) — 서버 대역. 클라이언트 원본은 explore.search-query.ts */
const TAG_PREFIX = '#';

/**
 * 필드 가중 랭킹의 대역 — 우선순위는 제목 > 태그 > 저자 > 주제명(explore.md 4.5-5. 설명 필드는
 * mock 풀에 없어 제외한다). 태그는 항목 하나라도 부분 일치하면 매칭이다(KAN-218). 계수 값은 서버 구현 소유라
 * 여기 숫자는 순위 재현용일 뿐이다. 동점은 풀 순서 유지(안정 정렬) — 유사도·인기·최신순 해소는 서버 몫의 단순화다.
 */
const searchScore = (content: ExploreContentDto, query: string): number => {
  let score = 0;
  if (normalizeForSearch(content.title).includes(query)) score += 8;
  if ((content.tags ?? []).some((tag) => normalizeForSearch(tag).includes(query))) score += 4;
  if (normalizeForSearch(content.author_name ?? '').includes(query)) score += 2;
  if (topicNamesOf(content).some((name) => normalizeForSearch(name).includes(query))) score += 1;
  return score;
};

/* ── 오타 교정("대신 검색")의 대역 — 서버 `hangul_to_jamo` + `word_similarity`(KAN-238, explore.md 4.5-5) ── */

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
const CHOSEONG = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const JUNGSEONG = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const JONGSEONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

/** 완성형 음절을 초·중·종성으로 푼다 — 겹모음·겹받침은 한 글자로 두는 단순화(서버는 치는 순서대로 더 푼다). 그 외 문자는 그대로 */
const toJamo = (text: string): string =>
  [...text]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code < HANGUL_FIRST || code > HANGUL_LAST) return ch;
      const index = code - HANGUL_FIRST;
      return (
        CHOSEONG[Math.floor(index / 588)] +
        JUNGSEONG[Math.floor((index % 588) / 28)] +
        JONGSEONG[index % 28]
      );
    })
    .join('');

const trigramsOf = (text: string): Set<string> => {
  const padded = `  ${text} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) grams.add(padded.slice(i, i + 3));
  return grams;
};

/** `word_similarity(질의, 어휘)`의 대역 — 질의 트라이그램 중 어휘에 있는 비율 */
const jamoWordSimilarity = (query: string, term: string): number => {
  const q = trigramsOf(toJamo(query));
  const t = trigramsOf(toJamo(term));
  let hit = 0;
  for (const gram of q) if (t.has(gram)) hit += 1;
  return q.size === 0 ? 0 : hit / q.size;
};

/** 교정어 임계값 — 서버 소유 상수의 대역(시작 0.5) */
const CORRECTION_THRESHOLD = 0.5;
/** 제목 토큰 끝의 조사 — 어휘를 "커리어를"이 아니라 "커리어"로 만든다 */
const TRAILING_PARTICLE = /(을|를|이|가|은|는|의|에|로|와|과|도)$/u;

/**
 * 교정어 어휘 — 태그·주제명·시리즈 제목(스위치 켜짐)·제목 토큰(조사 제거, 2자 이상). 앞 그룹이 깨끗한 명사라 동점에서 우선한다.
 * 수백 편 규모라 질의 때마다 전수 비교해도 된다(서버도 같은 판단 — changes/pending/search-similar-fallback.md)
 */
const correctionVocabulary = (): { term: string; rank: number }[] => {
  const seen = new Map<string, number>();
  const add = (term: string, rank: number) => {
    const normalized = normalizeForSearch(term.trim());
    if (normalized.length < 2) return;
    const prev = seen.get(normalized);
    if (prev === undefined || rank < prev) seen.set(normalized, rank);
  };
  const contents = [...CONTENT_POOL, ...SERIES_EPISODES];
  for (const content of contents) for (const tag of content.tags ?? []) add(tag, 0);
  for (const topic of [...INTEREST_TOPICS, ...OTHER_TOPICS]) add(topic.name, 0);
  if (IS_SERIES_CARDS_ENABLED) for (const series of MOCK_SERIES) add(series.title, 1);
  for (const content of contents) {
    for (const token of content.title.split(/[\s—\-·,.!?]+/u)) {
      add(token.replace(TRAILING_PARTICLE, ''), 2);
    }
  }
  return [...seen.entries()].map(([term, rank]) => ({ term, rank }));
};

/** 교정어 하나 — 임계값 이상 중 유사도 최대, 동점은 태그·주제명 우선. 원문과 같은 말은 교정어가 아니다 */
const suggestCorrection = (query: string): string | null => {
  let best: { term: string; rank: number; score: number } | null = null;
  for (const entry of correctionVocabulary()) {
    if (entry.term === query) continue;
    const score = jamoWordSimilarity(query, entry.term);
    if (score < CORRECTION_THRESHOLD) continue;
    if (best === null || score > best.score || (score === best.score && entry.rank < best.rank)) {
      best = { ...entry, score };
    }
  }
  return best?.term ?? null;
};

/**
 * 키워드 엔진의 후보 목록 — 시리즈는 편 단위로 걸고 카드 하나로 접는다(explore-api.md 4.1-1). 켜짐이면 시리즈 제목 일치도
 * 든다(가중은 제목과 같다). 태그 전용 검색은 태그만 본다. 대역이라 맞는 시리즈는 결과 맨 앞에 둔다
 */
const keywordPool = (query: string, isTagMode: boolean): ExploreEntryDto[] => {
  if (SCENARIO === 'empty') return [];
  const matchedSeries = MOCK_SERIES.filter((series) => {
    const episodes = SERIES_EPISODES.filter((c) => c.series?.id === series.id);
    if (isTagMode) {
      return episodes.some((c) => (c.tags ?? []).some((tag) => normalizeForSearch(tag) === query));
    }
    return (
      (IS_SERIES_CARDS_ENABLED && normalizeForSearch(series.title).includes(query)) ||
      episodes.some((c) => searchScore(c, query) > 0)
    );
  });
  const contentPool = isTagMode
    ? // 태그 전용 — 태그 항목과 정확히 같은 콘텐츠만(NFC + 소문자, 필드 가중 없음 — explore.md 4.5-5)
      CONTENT_POOL.filter((content) =>
        (content.tags ?? []).some((tag) => normalizeForSearch(tag) === query),
      )
    : CONTENT_POOL.map((content) => ({ content, score: searchScore(content, query) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.content);
  return matchedSeries.reduce(
    (entries, series) => withSeries(entries, series.id, 0),
    contentPool.map(toItemDto) as ExploreEntryDto[],
  );
};

export const mockFetchSearch = async (params: {
  query: string;
  cursor?: string;
  /** 교정 끄기(KAN-239) — "혹시 ‘OO’로 검색하고 싶나요?" 탭 */
  exact?: boolean;
}): Promise<ExploreSearchResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  // 검색 실패 시나리오 — 직전 결과 유지 + 상단 배너 경로 검증용(explore.md 7장)
  if (SCENARIO === 'search-error') {
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      '일시적인 오류가 발생했어요',
      false,
      null,
      null,
      500,
    );
  }

  // 서버 방어선(explore-api.md 4.5) — 클라이언트 필터(explore.search-query.ts)를 우회한 요청은 400이다.
  // `#` 질의는 앞의 `#` 하나를 떼고 다시 트림한 값으로 잰다(`#`·`#a` → 400 — KAN-218)
  const trimmed = params.query.trim();
  const isTagMode = trimmed.startsWith(TAG_PREFIX);
  const term = isTagMode ? trimmed.slice(TAG_PREFIX.length).trim() : trimmed;
  if (term.length < 2 || !/[\p{L}\p{N}]/u.test(term)) {
    throw new ApiError(
      ERROR_CODES.VALIDATION_FAILED,
      '검색어를 확인해주세요',
      false,
      null,
      null,
      400,
    );
  }

  const query = normalizeForSearch(term);
  /*
   * 흐름(explore.md 4.5-5 — KAN-238 대역): ① 키워드 → ② 키워드 0건이고 태그 전용·exact 가 아니면 교정어 → 교정어로 키워드
   * 1건 이상일 때만 교정 적용(`query_used`·`corrected_from`). 의미 엔진은 임베딩이 없어 `search-related` 시나리오로만 흉내 낸다
   */
  let queryUsed = query;
  let correctedFrom: string | null = null;
  let pool = keywordPool(query, isTagMode);
  if (pool.length === 0 && !isTagMode && !params.exact) {
    const corrected = suggestCorrection(query);
    const correctedPool = corrected === null ? [] : keywordPool(corrected, false);
    if (corrected !== null && correctedPool.length > 0) {
      queryUsed = corrected;
      correctedFrom = query;
      pool = correctedPool;
    }
  }
  const engines: ExploreSearchResponseDto['engines'] = isTagMode
    ? ['keyword']
    : ['keyword', 'semantic'];
  let match: ExploreSearchResponseDto['match'] = 'keyword';
  if (pool.length > 0) {
    pool = pool.map((entry) => ({ ...entry, matched_by: ['keyword'] }));
  } else if (!isTagMode && SCENARIO === 'search-related') {
    // 의미 유사 결과만 있는 응답의 대역 — "‘OO’와 관련된 결과예요"(KAN-239) 검증용. 인기 목록을 의미 결과로 빌려 쓴다
    pool = popularEntries('month')
      .slice(0, 5)
      .map((entry) => ({ ...entry, matched_by: ['semantic'] }));
    match = 'related';
  }

  // 빈 결과 — 같은 응답에 fallback을 싣는다(explore-api.md 4.5). 관련 주제·인기 목록은 대역 값이다
  if (pool.length === 0) {
    const isEmptyPool = SCENARIO === 'empty';
    return {
      items: [],
      next_cursor: null,
      has_next: false,
      fallback: {
        related_topics: isEmptyPool ? [] : [INTEREST_TOPICS[0], OTHER_TOPICS[0]],
        // fallback 인기 목록도 같은 규칙으로 접힌다 — 시리즈 카드가 섞인다(explore-api.md 4.1-1)
        popular_items: isEmptyPool ? [] : popularEntries('month').slice(0, 5),
      },
      query_used: queryUsed,
      corrected_from: null,
      match: 'keyword',
      engines,
    };
  }

  const startIndex = params.cursor
    ? pool.findIndex((entry) => entryCursorKey(entry) === params.cursor) + 1
    : 0;
  // 발급 시점과 다른 query의 커서도 여기에 걸린다(explore-api.md 4.5 에러 표)
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
    items: page,
    next_cursor: hasNext ? entryCursorKey(page[page.length - 1]) : null,
    has_next: hasNext,
    fallback: null,
    // KAN-238 필드 — 응답마다 반복한다(커서 페이지도 같은 교정어)
    query_used: queryUsed,
    corrected_from: correctedFrom,
    match,
    engines,
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
    authorName: content.author_name ?? '',
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

/**
 * 시리즈 화면의 첫 상태 대역 — 라이브러리 mock 에 아직 없는 편에도 완청·재생 중·담음 세 상태가 처음부터 보이게 한다.
 * 라이브러리 mock 에 그 편이 생기면(재생·담기) 그쪽 담김 값이 이긴다
 */
const SERIES_SEED_STATE: Record<string, Pick<SeriesEpisodeDto, 'library' | 'progress'>> = {
  'content-201': {
    library: { item_id: 'library-item-content-201', source: 'save', status: 'completed' },
    progress: { position_sec: 1020, max_reached_sec: 1020 },
  },
  'content-202': {
    library: { item_id: 'library-item-content-202', source: 'save', status: 'in_progress' },
    progress: { position_sec: 372, max_reached_sec: 372 },
  },
  'content-203': {
    library: { item_id: 'library-item-content-203', source: 'drip', status: 'unplayed' },
    progress: null,
  },
};

/** GET /series/:series_id 의 대역(explore-api.md 4.7) — 없는 시리즈는 404 NOT_FOUND */
/**
 * 관련 콘텐츠 대역(player-api.md 4.8) — 임베딩이 없으니 같은 주제의 편을 "비슷한 편"으로 친다. 기준 편·`excludeIds`는 뺀다.
 * 없는 편은 404 `CONTENT_NOT_FOUND`(서버 코드 그대로)
 */
export const mockFetchRelatedContents = async (params: {
  contentId: string;
  excludeIds: string[];
}): Promise<RelatedContentsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const all = [...CONTENT_POOL, ...SERIES_EPISODES];
  const base = all.find((content) => content.id === params.contentId);
  if (!base) {
    throw new ApiError(
      ERROR_CODES.CONTENT_NOT_FOUND,
      '콘텍츠를 찾을 수 없어요',
      false,
      null,
      null,
      404,
    );
  }
  const exclude = new Set([params.contentId, ...params.excludeIds]);
  const related = all
    .filter((content) => !exclude.has(content.id))
    .filter((content) => content.topic_ids.some((id) => base.topic_ids.includes(id)))
    .slice(0, 5);
  return { items: related.map(toItemDto) };
};

export const mockFetchSeriesDetail = async (seriesId: string): Promise<SeriesDetailResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  const series = findSeries(seriesId);
  if (!series) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, '시리즈를 찾을 수 없어요', false, null, null, 404);
  }

  return {
    series: {
      id: series.id,
      title: series.title,
      description: series.description,
      total_episodes: series.totalEpisodes,
      status: series.status,
      thumbnail_url: `https://picsum.photos/seed/content-${series.episodeSeqs[0]}/200`,
      // 대표 중분류 — 앨범 화면 제목 아래 카테고리 줄. 서버는 편들의 주제에서 대표 하나를 고른다(여기선 mock 시리즈의 주제)
      topic: series.topic,
      // 발행일자 — mock 은 고정 날짜(실서버는 노출 편 중 가장 이른 published_at)
      published_at: '2026-10-01T00:00:00.000Z',
      is_saved: MOCK_SAVED_SERIES.has(series.id),
    },
    episodes: series.episodeSeqs.map((seq) => {
      const content = makeSeriesEpisode(series, seq);
      const seed = SERIES_SEED_STATE[content.id];
      return {
        episode_no: content.series?.episode_no ?? 0,
        content,
        library: getMockLibraryItemByContentId(content.id) ?? seed?.library ?? null,
        progress: seed?.progress ?? null,
        is_counted_today: isMockCountedToday(content.id),
      };
    }),
  };
};

/* ── 시리즈째 담기·빼기·실행 취소 대역(explore-api.md 4.8~4.10 — KAN-246). 라이브러리 mock 상태와 정합을 맞춘다 ── */
const MOCK_SAVED_SERIES = new Set<string>();
/** 시리즈째 빼기로 뺀 항목 id → 콘텐츠 id — 실행 취소가 되살릴 편을 찾는다 */
const MOCK_REMOVED_SERIES_ITEMS = new Map<string, { seriesId: string; contentId: string }>();

const mockSeriesOrThrow = (seriesId: string): MockSeries => {
  const series = findSeries(seriesId);
  if (!series) {
    throw new ApiError(ERROR_CODES.NOT_FOUND, '시리즈를 찾을 수 없어요', false, null, null, 404);
  }
  return series;
};

const mockSaveSeriesEpisode = (content: ExploreContentDto) =>
  mockSaveLibraryItemByContent(content.id, {
    title: content.title,
    authorName: content.author_name ?? '',
    sourceName: content.source_name,
    durationSec: content.duration_sec,
    topicIds: content.topic_ids,
  });

export const mockSaveSeries = async (
  seriesId: string,
  clientSeq: number,
): Promise<SaveSeriesResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const series = mockSeriesOrThrow(seriesId);
  MOCK_SAVED_SERIES.add(seriesId);
  let added = 0;
  for (const seq of series.episodeSeqs) {
    const content = makeSeriesEpisode(series, seq);
    if (mockSaveSeriesEpisode(content).created) added += 1;
  }
  return { series_id: seriesId, added_count: added, client_seq: clientSeq };
};

export const mockUnsaveSeries = async (
  seriesId: string,
  clientSeq: number,
): Promise<UnsaveSeriesResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const series = mockSeriesOrThrow(seriesId);
  MOCK_SAVED_SERIES.delete(seriesId);
  const removed: string[] = [];
  for (const seq of series.episodeSeqs) {
    const contentId = `content-${seq}`;
    const item = getMockLibraryItemByContentId(contentId);
    if (!item) continue;
    MOCK_REMOVED_SERIES_ITEMS.set(item.item_id, { seriesId, contentId });
    removed.push(item.item_id);
    mockUnsaveLibraryItemByContent(contentId);
  }
  return { series_id: seriesId, removed_item_ids: removed, client_seq: clientSeq };
};

export const mockRestoreSeries = async (
  seriesId: string,
  itemIds: string[],
): Promise<RestoreSeriesResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const series = mockSeriesOrThrow(seriesId);
  MOCK_SAVED_SERIES.add(seriesId);
  const restored: string[] = [];
  for (const itemId of itemIds) {
    const removed = MOCK_REMOVED_SERIES_ITEMS.get(itemId);
    // 남의 항목·다른 시리즈 편은 조용히 무시한다(서버 4.10과 같다)
    if (!removed || removed.seriesId !== seriesId) continue;
    const seq = Number(removed.contentId.replace('content-', ''));
    restored.push(mockSaveSeriesEpisode(makeSeriesEpisode(series, seq)).library_item.id);
    MOCK_REMOVED_SERIES_ITEMS.delete(itemId);
  }
  return { series_id: seriesId, restored_item_ids: restored, is_saved: true };
};
