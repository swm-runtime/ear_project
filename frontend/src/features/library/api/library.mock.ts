/**
 * 라이브러리 API mock — 백엔드 엔드포인트가 구현되기 전 화면 테스트용 대역이다.
 * 온보딩 mock과 같은 관례로, 네트워크를 가로채지 않고 api 모듈 안에서 구현체만 갈아끼운다.
 *
 * 목록·삭제·복구를 서버처럼 상태로 들고 있어 상태 전이·페이지네이션을 화면에서 검증할 수
 * 있다. 앱 리로드 시 상태는 초기화된다. 잔여 재생 카운트 상태(play_records의 대역)는
 * player mock이 소유하며(진입점 화면 간 정합 — explore-uiux.md 4.2), 이 mock은 잔여
 * 표시값·is_counted_today를 거기서 가져다 얹고, 재생이 만드는 항목 상태 전이는 아래
 * 브리지 등록으로 제공한다.
 *
 * 시나리오 전환(EXPO_PUBLIC_LIBRARY_MOCK_SCENARIO — player mock과 공유):
 * - (기본)      무료 티어(daily_play_limit=2, 오늘 1회 사용). 25건으로 무한 스크롤 검증
 * - fresh       가입 직후 첫 진입 — 온보딩 담기 2건 + 첫 드립 2건, 전부 미청취, 오늘 0회 사용
 * - unlimited   무제한 티어 — 잔여 표시·확인 팝업이 나타나지 않아야 한다(L1)
 * - exhausted   오늘 한도 소진(0/2) — L12·페이월 진입 검증
 * - empty       빈 라이브러리 — L6 검증
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import {
  getMockSourceUrl,
  isMockCountedToday,
  mockPlayLimitFields,
  registerPlayMockLibraryBridge,
} from '@/features/player';

import type {
  CompleteResponseDto,
  LibraryItemDto,
  LibraryItemsRequestDto,
  LibraryItemsResponseDto,
  LibraryTopicsResponseDto,
  ResumeResponseDto,
  RestoreResponseDto,
} from './library.dto';

const SCENARIO = process.env.EXPO_PUBLIC_LIBRARY_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 600;
const PAGE_SIZE = 20;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_TOPICS = [
  { id: 'topic-career', name: '커리어' },
  { id: 'topic-productivity', name: '생산성' },
  { id: 'topic-tech', name: 'IT·테크' },
  { id: 'topic-ai', name: '인공지능' },
  { id: 'topic-psychology', name: '심리' },
];

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
    // player mock의 샘플 오디오(약 6분) 안에서 재생 끝·완청(90%)까지 검증할 수 있는 길이로 둔다
    durationSec: 240 + (seq % 5) * 30,
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
  // 듣다 만 콘텐츠 — 미니플레이어 복원 대상(재생 위치 > 0). 길이 300초 중 132초 지점
  items[1] = makeItem(2, {
    status: 'in_progress',
    lastPlayedAt: new Date(Date.UTC(2026, 7, 7, 1, 12)).toISOString(),
    positionSec: 132,
    maxReachedSec: 132,
  });
  // 완청 — 완료 탭·미니플레이어 제외 검증. 길이 240초를 끝까지 들은 상태
  items[4] = makeItem(5, {
    status: 'completed',
    lastPlayedAt: new Date(Date.UTC(2026, 7, 5, 22, 30)).toISOString(),
    completedAt: new Date(Date.UTC(2026, 7, 5, 22, 40)).toISOString(),
    positionSec: 230,
    maxReachedSec: 240,
  });
  items[7] = makeItem(8, { source: 'onboarding' });
  // 탐험 편 1건(하루 1편 — drip-scheduling.md 4.8) — 구획·행 배지·배너 합산 확인용
  items[2] = makeItem(3, { source: 'discovery' });
  return items;
};

interface MockServerState {
  items: MockItem[];
}

const initialState = (): MockServerState => ({ items: initialItems() });

let state = initialState();

export const resetLibraryMock = (): void => {
  state = initialState();
};

const toItemDto = (item: MockItem): LibraryItemDto => ({
  id: item.id,
  source: item.source,
  status: item.status,
  added_at: item.addedAt,
  last_played_at: item.lastPlayedAt,
  completed_at: item.completedAt,
  is_counted_today: isMockCountedToday(item.contentId),
  content: {
    id: item.contentId,
    title: item.title,
    author_name: item.authorName,
    source_name: item.sourceName,
    // origin·source_url 규칙은 player mock 소유다 — 발급·상세와 같은 값이어야 한다
    source_url: getMockSourceUrl(item.contentId),
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
  // drip은 탐험 편성분을 포함한다 — source IN ('drip','discovery')(library-api.md 4.1 개정 2026-08-27)
  if (params.source_filter === 'drip') {
    items = items.filter((item) => item.source === 'drip' || item.source === 'discovery');
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
    ...mockPlayLimitFields(),
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
          is_counted_today: isMockCountedToday(target.contentId),
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
    ...mockPlayLimitFields(),
  };
};

/* ── 재생(player mock)이 만드는 라이브러리 상태 전이·진행 저장·완청 판정 — 실서버에서
      playback 모듈이 library Service를 호출하는 구조(library-api.md 8장)의 mock 대응이다 ── */

/** 완청 임계 90%(player.md 4.4) — 판정은 서버(대역)만 한다. 클라이언트는 판정하지 않는다 */
const COMPLETE_THRESHOLD_RATIO = 0.9;

registerPlayMockLibraryBridge({
  onPlayed: (contentId) => {
    const item = visibleItems().find((i) => i.contentId === contentId) ?? null;
    if (!item) return null;
    if (item.status === 'unplayed') item.status = 'in_progress';
    item.lastPlayedAt = new Date().toISOString();
    return {
      library_item: { id: item.id, status: item.status, last_played_at: item.lastPlayedAt ?? '' },
      progress:
        item.maxReachedSec > 0
          ? { position_sec: item.positionSec, max_reached_sec: item.maxReachedSec }
          : null,
    };
  },
  getContentSnapshot: (contentId) => {
    const item = visibleItems().find((i) => i.contentId === contentId) ?? null;
    if (!item) return null;
    return {
      content: {
        id: item.contentId,
        title: item.title,
        author_name: item.authorName,
        source_name: item.sourceName,
        duration_sec: item.durationSec,
        thumbnail_url: `https://picsum.photos/seed/${item.contentId}/200`,
        content_version: 1,
      },
      library_item: { id: item.id, status: item.status },
      progress:
        item.maxReachedSec > 0
          ? { position_sec: item.positionSec, max_reached_sec: item.maxReachedSec }
          : null,
    };
  },
  onProgressSaved: (contentId, positionSec, maxReachedSec) => {
    const item = visibleItems().find((i) => i.contentId === contentId) ?? null;
    if (!item) return null;
    // 값 보정 — duration 초과분은 duration으로 저장한다(player-api.md 4.3 서버 처리 3)
    item.positionSec = Math.min(positionSec, item.durationSec);
    item.maxReachedSec = Math.min(maxReachedSec, item.durationSec);
    // 완청 판정(서버 대역) — 이미 completed면 전이를 반복하지 않는다(completed_at 최초 값 유지)
    if (
      item.status !== 'completed' &&
      item.durationSec > 0 &&
      item.maxReachedSec >= item.durationSec * COMPLETE_THRESHOLD_RATIO
    ) {
      item.status = 'completed';
      item.completedAt = new Date().toISOString();
    }
    return { id: item.id, status: item.status, completed_at: item.completedAt };
  },
});

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

/* ── 탐색 mock 브리지(dev 전용) — 탐색의 담김 표시·담기·해제가 라이브러리 mock 상태와
      정합하도록 탐색 mock이 가져다 쓴다(explore-api.md 4.3·4.4 서버 처리의 대역) ── */

export interface MockLibraryStateByContent {
  item_id: string;
  source: LibraryItemDto['source'];
  status: LibraryItemDto['status'];
}

/** 탐색 행의 library 필드(담김 표시·시트 분기)용 — 살아 있는 항목만 돌려준다 */
export const getMockLibraryItemByContentId = (
  contentId: string,
): MockLibraryStateByContent | null => {
  const item = visibleItems().find((i) => i.contentId === contentId);
  return item ? { item_id: item.id, source: item.source, status: item.status } : null;
};

export interface MockLibrarySaveMeta {
  title: string;
  authorName: string;
  sourceName: string;
  durationSec: number;
  topicIds: string[];
}

export interface MockLibrarySaveResult {
  library_item: {
    id: string;
    source: LibraryItemDto['source'];
    status: LibraryItemDto['status'];
    added_at: string;
  };
  /** 새로 담김(201) 여부 — 이미 담긴 것을 다시 담으면 false(200)다 */
  created: boolean;
}

/** 담기(explore-api.md 4.3 서버 처리) — upsert이며 살아 있는 행은 아무것도 바꾸지 않는다 */
export const mockSaveLibraryItemByContent = (
  contentId: string,
  meta: MockLibrarySaveMeta,
): MockLibrarySaveResult => {
  const existing = state.items.find((i) => i.contentId === contentId);
  if (existing && !existing.deleted) {
    return {
      library_item: {
        id: existing.id,
        source: existing.source,
        status: existing.status,
        added_at: existing.addedAt,
      },
      created: false,
    };
  }
  if (existing) {
    // 삭제된 행의 재활성 — 재담기는 새 담기 조작이므로 적립 시각을 새로 찍는다(복구와 다르다)
    existing.deleted = false;
    existing.source = 'save';
    existing.addedAt = new Date().toISOString();
    return {
      library_item: {
        id: existing.id,
        source: existing.source,
        status: existing.status,
        added_at: existing.addedAt,
      },
      created: false,
    };
  }
  const item: MockItem = {
    id: `library-item-${contentId}`,
    contentId,
    source: 'save',
    status: 'unplayed',
    addedAt: new Date().toISOString(),
    lastPlayedAt: null,
    completedAt: null,
    title: meta.title,
    authorName: meta.authorName,
    sourceName: meta.sourceName,
    durationSec: meta.durationSec,
    topicIds: meta.topicIds,
    positionSec: 0,
    maxReachedSec: 0,
    deleted: false,
  };
  state.items.unshift(item);
  return {
    library_item: { id: item.id, source: item.source, status: item.status, added_at: item.addedAt },
    created: true,
  };
};

/** 담기 해제(explore-api.md 4.4 서버 처리) — 소프트 삭제. 대상이 없어도 실패하지 않는다 */
export const mockUnsaveLibraryItemByContent = (contentId: string): void => {
  const item = state.items.find((i) => i.contentId === contentId && !i.deleted);
  if (item) item.deleted = true;
};
