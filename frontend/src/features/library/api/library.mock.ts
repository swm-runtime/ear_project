/**
 * 라이브러리 API mock — 백엔드 엔드포인트가 구현되기 전 화면 테스트용 대역이다.
 * 온보딩 mock과 같은 관례로, 네트워크를 가로채지 않고 api 모듈 안에서 구현체만 갈아끼운다.
 *
 * 목록·삭제·복구·재생을 서버처럼 상태로 들고 있어 상태 전이·잔여 차감·페이지네이션을
 * 화면에서 검증할 수 있다. 앱 리로드 시 상태는 초기화된다.
 *
 * 시나리오 전환(EXPO_PUBLIC_LIBRARY_MOCK_SCENARIO):
 * - (기본)      무료 티어(daily_play_limit=2, 오늘 1회 사용). 25건으로 무한 스크롤 검증
 * - fresh       가입 직후 첫 진입 — 온보딩 담기 2건 + 첫 드립 2건, 전부 미청취, 오늘 0회 사용
 * - unlimited   무제한 티어 — 잔여 표시·확인 팝업이 나타나지 않아야 한다(L1)
 * - exhausted   오늘 한도 소진(0/2) — L12·페이월 진입 검증
 * - empty       빈 라이브러리 — L6 검증
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type {
  CompleteResponseDto,
  LibraryItemDto,
  LibraryItemsRequestDto,
  LibraryItemsResponseDto,
  LibraryTopicsResponseDto,
  PlayLimitFieldsDto,
  PlayStartResponseDto,
  ResumeResponseDto,
  RestoreResponseDto,
} from './library.dto';

const SCENARIO = process.env.EXPO_PUBLIC_LIBRARY_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 600;
const PAGE_SIZE = 20;
/** 서비스 날짜는 서버가 04:00 KST 경계로 계산해 내려주는 값이다 — mock은 고정 라벨을 쓴다 */
const SERVICE_DATE = '2026-08-07';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_TOPICS = [
  { id: 'topic-career', name: '커리어' },
  { id: 'topic-productivity', name: '생산성' },
  { id: 'topic-tech', name: 'IT·테크' },
  { id: 'topic-ai', name: '인공지능' },
  { id: 'topic-psychology', name: '심리' },
];

/** 파트너 회수 시뮬레이션 — 목록에는 남아 있지만 재생하면 CONTENT_WITHDRAWN이 난다(L13) */
const WITHDRAWN_CONTENT_ID = 'content-12';

interface MockItem {
  id: string;
  contentId: string;
  source: LibraryItemDto['source'];
  status: LibraryItemDto['status'];
  addedAt: string;
  lastPlayedAt: string | null;
  completedAt: string | null;
  title: string;
  authorName: string;
  sourceName: string;
  durationSec: number;
  topicIds: string[];
  positionSec: number;
  maxReachedSec: number;
  deleted: boolean;
}

const makeItem = (seq: number, overrides: Partial<MockItem> = {}): MockItem => {
  const topic = MOCK_TOPICS[seq % MOCK_TOPICS.length];
  // 최근 적립이 위로 오도록 seq가 작을수록 최신 시각을 준다
  const addedAt = new Date(Date.UTC(2026, 7, 6, 21, 0) - seq * 3 * 60 * 60 * 1000).toISOString();
  return {
    id: `library-item-${seq}`,
    contentId: `content-${seq}`,
    source: seq % 3 === 0 ? 'save' : 'drip',
    status: 'unplayed',
    addedAt,
    lastPlayedAt: null,
    completedAt: null,
    title: `${topic.name} 이야기 ${seq} — 오래 일하는 사람들의 습관`,
    authorName: `저자 ${seq}`,
    sourceName: seq % 2 === 0 ? '폴인' : '롱블랙',
    durationSec: 480 + (seq % 5) * 120,
    topicIds: [topic.id],
    positionSec: 0,
    maxReachedSec: 0,
    deleted: false,
    ...overrides,
  };
};

const initialItems = (): MockItem[] => {
  if (SCENARIO === 'empty') return [];
  // 가입 직후 — 온보딩에서 담은 2건 + 첫 드립 2건. 들은 것이 없으므로 미니플레이어도 뜨지 않는다
  if (SCENARIO === 'fresh') {
    return [
      makeItem(1, { source: 'drip' }),
      makeItem(2, { source: 'drip' }),
      makeItem(3, { source: 'onboarding' }),
      makeItem(4, { source: 'onboarding' }),
    ];
  }
  const items = Array.from({ length: 25 }, (_, i) => makeItem(i + 1));
  // 듣다 만 콘텐츠 — 미니플레이어 복원 대상(재생 위치 > 0)
  items[1] = makeItem(2, {
    status: 'in_progress',
    lastPlayedAt: new Date(Date.UTC(2026, 7, 7, 1, 12)).toISOString(),
    positionSec: 372,
    maxReachedSec: 372,
  });
  // 완청 — 완료 탭·미니플레이어 제외 검증
  items[4] = makeItem(5, {
    status: 'completed',
    lastPlayedAt: new Date(Date.UTC(2026, 7, 5, 22, 30)).toISOString(),
    completedAt: new Date(Date.UTC(2026, 7, 5, 22, 40)).toISOString(),
    positionSec: 590,
    maxReachedSec: 600,
  });
  items[7] = makeItem(8, { source: 'onboarding' });
  return items;
};

interface MockServerState {
  items: MockItem[];
  /** 오늘의 서비스 날짜에 카운트된 content_id 집합 — play_records의 mock */
  playedToday: Set<string>;
}

const initialState = (): MockServerState => {
  const items = initialItems();
  const playedToday = new Set<string>();
  if (SCENARIO === 'exhausted') {
    playedToday.add('content-2').add('content-3');
  } else if (SCENARIO !== 'unlimited' && SCENARIO !== 'empty' && SCENARIO !== 'fresh') {
    playedToday.add('content-2');
  }
  return { items, playedToday };
};

let state = initialState();

export const resetLibraryMock = (): void => {
  state = initialState();
};

const playLimitFields = (): PlayLimitFieldsDto => ({
  daily_play_limit: SCENARIO === 'unlimited' ? null : 2,
  daily_play_count: SCENARIO === 'unlimited' ? null : state.playedToday.size,
  service_date: SERVICE_DATE,
});

const toItemDto = (item: MockItem): LibraryItemDto => ({
  id: item.id,
  source: item.source,
  status: item.status,
  added_at: item.addedAt,
  last_played_at: item.lastPlayedAt,
  completed_at: item.completedAt,
  is_counted_today: state.playedToday.has(item.contentId),
  content: {
    id: item.contentId,
    title: item.title,
    author_name: item.authorName,
    source_name: item.sourceName,
    duration_sec: item.durationSec,
    thumbnail_url: `https://picsum.photos/seed/${item.contentId}/200`,
    content_version: 1,
    topic_ids: item.topicIds,
  },
  progress:
    item.maxReachedSec > 0
      ? { position_sec: item.positionSec, max_reached_sec: item.maxReachedSec }
      : null,
});

const visibleItems = (): MockItem[] => state.items.filter((item) => !item.deleted);

export const mockFetchItems = async (
  params: LibraryItemsRequestDto,
): Promise<LibraryItemsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  const filter = params.filter ?? 'all';
  const topicIds = params.topic_filter ? params.topic_filter.split(',') : [];

  let items = visibleItems().filter((item) => {
    if (filter === 'unplayed') return item.status === 'unplayed' || item.status === 'in_progress';
    if (filter === 'completed') return item.status === 'completed';
    if (filter === 'drip') return item.source === 'drip';
    return true;
  });
  // 출처 필터 — save는 사용자가 직접 담은 것(save·onboarding)을 묶는다(FE 개편 2026-08-07)
  if (params.source_filter === 'drip') {
    items = items.filter((item) => item.source === 'drip');
  } else if (params.source_filter === 'save') {
    items = items.filter((item) => item.source === 'save' || item.source === 'onboarding');
  }
  // 탭과 주제는 AND, 주제끼리는 OR(library-api.md 4.1)
  if (topicIds.length > 0) {
    items = items.filter((item) => item.topicIds.some((id) => topicIds.includes(id)));
  }
  items = [...items].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));

  const startIndex = params.cursor ? items.findIndex((item) => item.id === params.cursor) + 1 : 0;
  if (params.cursor !== undefined && startIndex === 0) {
    throw new ApiError(
      ERROR_CODES.LIBRARY_CURSOR_INVALID,
      '커서가 유효하지 않아요',
      false,
      null,
      null,
      400,
    );
  }
  const page = items.slice(startIndex, startIndex + PAGE_SIZE);
  const hasNext = startIndex + PAGE_SIZE < items.length;

  return {
    items: page.map(toItemDto),
    next_cursor: hasNext ? page[page.length - 1].id : null,
    has_next: hasNext,
    ...playLimitFields(),
  };
};

export const mockFetchTopics = async (): Promise<LibraryTopicsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const counts = new Map<string, number>();
  visibleItems().forEach((item) =>
    item.topicIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)),
  );
  return {
    topics: MOCK_TOPICS.filter((topic) => counts.has(topic.id)).map((topic) => ({
      id: topic.id,
      name: topic.name,
      item_count: counts.get(topic.id) ?? 0,
    })),
  };
};

export const mockFetchResume = async (): Promise<ResumeResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const candidates = visibleItems()
    .filter(
      (item) => item.status !== 'completed' && item.positionSec > 0 && item.lastPlayedAt !== null,
    )
    .sort((a, b) => ((a.lastPlayedAt ?? '') < (b.lastPlayedAt ?? '') ? 1 : -1));
  const target = candidates[0];

  return {
    resume_target: target
      ? {
          id: target.id,
          status: target.status,
          last_played_at: target.lastPlayedAt,
          is_counted_today: state.playedToday.has(target.contentId),
          content: {
            id: target.contentId,
            title: target.title,
            duration_sec: target.durationSec,
            thumbnail_url: `https://picsum.photos/seed/${target.contentId}/200`,
            content_version: 1,
          },
          progress: { position_sec: target.positionSec, max_reached_sec: target.maxReachedSec },
        }
      : null,
    ...playLimitFields(),
  };
};

export const mockStartPlay = async (contentId: string): Promise<PlayStartResponseDto> => {
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

  const limit = playLimitFields().daily_play_limit;
  const alreadyCounted = state.playedToday.has(contentId);
  if (limit !== null && !alreadyCounted && state.playedToday.size >= limit) {
    // 무료 티어 기준의 mock — 유료 한도(PLAY_LIMIT_REACHED) 경로는 백엔드 연동 후 검증한다
    throw new ApiError(
      ERROR_CODES.PLAY_LIMIT_EXCEEDED,
      '오늘 들을 수 있는 콘텐츠를 모두 들었어요',
      false,
      null,
      null,
      403,
    );
  }

  state.playedToday.add(contentId);

  const item = visibleItems().find((i) => i.contentId === contentId) ?? null;
  if (item) {
    if (item.status === 'unplayed') item.status = 'in_progress';
    item.lastPlayedAt = new Date().toISOString();
  }

  return {
    counted: !alreadyCounted,
    library_item: item
      ? { id: item.id, status: item.status, last_played_at: item.lastPlayedAt ?? '' }
      : null,
    progress:
      item && item.maxReachedSec > 0
        ? { position_sec: item.positionSec, max_reached_sec: item.maxReachedSec }
        : null,
    ...playLimitFields(),
  };
};

export const mockComplete = async (id: string): Promise<CompleteResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const item = state.items.find((i) => i.id === id);
  if (!item || item.deleted) {
    throw new ApiError(
      ERROR_CODES.LIBRARY_ITEM_NOT_FOUND,
      '항목을 찾을 수 없어요',
      false,
      null,
      null,
      404,
    );
  }
  if (item.status !== 'completed') {
    item.status = 'completed';
    item.completedAt = new Date().toISOString();
  }
  return { id: item.id, status: item.status, completed_at: item.completedAt ?? '' };
};

export const mockDelete = async (id: string): Promise<void> => {
  await delay(RESPONSE_DELAY_MS);
  const item = state.items.find((i) => i.id === id);
  if (!item) {
    throw new ApiError(
      ERROR_CODES.LIBRARY_ITEM_NOT_FOUND,
      '항목을 찾을 수 없어요',
      false,
      null,
      null,
      404,
    );
  }
  // 이미 삭제된 항목에도 204다 — 오프라인 큐 재전송을 실패시키지 않는다(library-api.md 4.6)
  item.deleted = true;
};

export const mockRestore = async (id: string): Promise<RestoreResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const item = state.items.find((i) => i.id === id);
  if (!item) {
    throw new ApiError(
      ERROR_CODES.LIBRARY_ITEM_NOT_FOUND,
      '항목을 찾을 수 없어요',
      false,
      null,
      null,
      404,
    );
  }
  item.deleted = false;
  return { id: item.id, status: item.status, added_at: item.addedAt, deleted_at: null };
};
