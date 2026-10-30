import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type { SeriesDetail, SeriesEpisode } from '../explore.types';
import { useSeriesScreen } from './useSeriesScreen';

const mockRequestPlay = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockSaveSeriesMutate = jest.fn();
let mockQueryState: {
  data: SeriesDetail | undefined;
  error: unknown;
  isError: boolean;
  isPending: boolean;
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ key: 'Series-1', name: 'Series', params: { seriesId: 's1' } }),
  useFocusEffect: jest.fn(),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));
jest.mock('@/shared/lib/logger', () => ({ logger: { warn: jest.fn(), debug: jest.fn() } }));
jest.mock('@/shared/ui/toast.store', () => ({
  useToastStore: (selector: (state: { show: () => void }) => unknown) =>
    selector({ show: jest.fn() }),
}));
jest.mock('@/features/library', () => ({ libraryKeys: { all: ['library'] } }));
jest.mock('@/features/player', () => ({
  sendSourceLinkClick: jest.fn(),
  usePlayGate: () => ({
    requestPlay: mockRequestPlay,
    confirmState: null,
    confirmPlay: jest.fn(),
    cancelConfirm: jest.fn(),
    suppressAndPlay: jest.fn(),
  }),
}));
jest.mock('@/features/share', () => ({
  useDeferredSheetShare: () => ({ requestShare: jest.fn(), handleSheetDismiss: jest.fn() }),
}));
jest.mock('../api/explore.api', () => ({
  exploreKeys: { all: ['explore'], series: (id: string) => ['explore', 'series', id] },
}));
jest.mock('./useSeriesDetailQuery', () => ({
  useSeriesDetailQuery: () => ({
    ...mockQueryState,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('./useSaveContentMutation', () => ({
  useSaveContentMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('./useUnsaveContentMutation', () => ({
  useUnsaveContentMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('./useSeriesSaveMutations', () => ({
  useSaveSeriesMutation: () => ({ mutate: mockSaveSeriesMutate }),
  useUnsaveSeriesMutation: () => ({ mutateAsync: jest.fn() }),
  useRestoreSeriesMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('./useSeriesMoreQueries', () => ({
  usePublisherSeriesQuery: () => ({ data: { publisherName: null, series: [] } }),
  useOtherSeriesQuery: () => ({ data: [] }),
  useSeriesRelatedQuery: () => ({ data: [] }),
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void | Promise<void>): Promise<void> | void;
  create(element: ReactNode): { unmount(): void };
}>('react-test-renderer');

let screen: ReturnType<typeof useSeriesScreen>;
function Probe() {
  const current = useSeriesScreen();
  useEffect(() => {
    screen = current;
  });
  return null;
}

const episode = (episodeNo: number, isCountedToday = false): SeriesEpisode => ({
  episodeNo,
  item: {
    type: 'content',
    content: {
      id: `e${episodeNo}`,
      title: `키워드로 빠르게 배우는 CS 지식 ${episodeNo}`,
      authorName: '',
      sourceName: '이어 스튜디오',
      sourceUrl: null,
      durationSec: 1260,
      thumbnailUrl: `https://example.com/${episodeNo}.webp`,
      contentVersion: 1,
      topicIds: ['t1'],
      tags: [],
      language: 'ko',
      isLocked: false,
      series: { id: 's1', title: '키워드로 빠르게 배우는 CS 지식', episodeNo, totalEpisodes: 16 },
    },
    library: null,
    isCountedToday,
    isCompleted: false,
  },
  progress: null,
});

const detail = (episodes: SeriesEpisode[]): SeriesDetail => ({
  series: {
    id: 's1',
    title: '키워드로 빠르게 배우는 CS 지식',
    description: '소개',
    totalEpisodes: 16,
    status: 'ongoing',
    thumbnailUrl: 'https://example.com/1.webp',
    topic: { id: 't1', name: 'IT·테크' },
    publishedAt: '2026-10-01T00:00:00.000Z',
    publisherName: '키워드',
    isSaved: false,
  },
  episodes,
});

let renderer: ReturnType<typeof create> | null = null;
const render = async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryState = { data: undefined, error: null, isError: false, isPending: true };
});
afterEach(() => {
  if (renderer) void act(() => renderer?.unmount());
  renderer = null;
});

describe('useSeriesScreen — 시리즈 화면(E14, explore.md 4.7)', () => {
  it('편을 서버 순서 그대로 내고, 머리의 편수는 노출 중인 편 수다', async () => {
    // given — 계획 16편 중 3편 노출
    mockQueryState = {
      data: detail([episode(1), episode(2), episode(3)]),
      error: null,
      isError: false,
      isPending: false,
    };

    // when
    await render();

    // then
    expect(screen.episodes.map((item) => item.episodeNo)).toEqual([1, 2, 3]);
    expect(screen.episodeCount).toBe(3);
    expect(screen.isNotFound).toBe(false);
    expect(screen.isFullError).toBe(false);
  });

  it('편 행 탭은 탐색 행과 같은 재생 게이트를 진입점 explore 로 부른다(재생 확인 팝업 힌트 포함)', async () => {
    // given
    mockQueryState = {
      data: detail([episode(1, true)]),
      error: null,
      isError: false,
      isPending: false,
    };
    await render();

    // when
    await act(() => screen.handleEpisodePress(screen.episodes[0].item));

    // then
    expect(mockRequestPlay).toHaveBeenCalledTimes(1);
    const [target, entryPoint] = mockRequestPlay.mock.calls[0] as [
      { contentId: string; isCountedToday: boolean },
      string,
    ];
    expect(target).toMatchObject({ contentId: 'e1', isCountedToday: true });
    expect(entryPoint).toBe('explore');
  });

  it('404 NOT_FOUND 면 "찾을 수 없음" 상태이고 전면 에러([다시 시도])가 아니다', async () => {
    // given
    mockQueryState = {
      data: undefined,
      error: new ApiError(ERROR_CODES.NOT_FOUND, '시리즈를 찾을 수 없어요', false, null, null, 404),
      isError: true,
      isPending: false,
    };

    // when
    await render();

    // then
    expect(screen.isNotFound).toBe(true);
    expect(screen.isFullError).toBe(false);
  });

  it('네트워크 실패면 전면 에러(네트워크 문구)다', async () => {
    // given
    mockQueryState = {
      data: undefined,
      error: new ApiError(ERROR_CODES.NETWORK_ERROR, '', true, null, null, null),
      isError: true,
      isPending: false,
    };

    // when
    await render();

    // then
    expect(screen.isNotFound).toBe(false);
    expect(screen.isFullError).toBe(true);
    expect(screen.isFullErrorNetwork).toBe(true);
  });
});

describe('useSeriesScreen — 시리즈째 담기(KAN-246, explore-api.md 4.8)', () => {
  it('[+]는 편마다가 아니라 시리즈 담기를 한 번 부른다', async () => {
    // given — 3편 중 아무것도 안 담김
    mockQueryState = {
      data: detail([episode(1), episode(2), episode(3)]),
      error: null,
      isError: false,
      isPending: false,
    };
    await render();

    // when
    await act(() => screen.saveSeries());

    // then
    expect(mockSaveSeriesMutate).toHaveBeenCalledTimes(1);
    expect(mockSaveSeriesMutate.mock.calls[0][0]).toEqual({ seriesId: 's1', clientSeq: 1 });
  });

  it('버튼은 편이 다 담겼는지가 아니라 series.isSaved 를 따른다', async () => {
    // given — 편은 전부 담겼지만 시리즈째 담은 적은 없다
    const saved = { itemId: 'li', source: 'save' as const, status: 'unplayed' as const };
    const allSaved = [episode(1), episode(2)].map((e) => ({
      ...e,
      item: { ...e.item, library: saved },
    }));
    mockQueryState = { data: detail(allSaved), error: null, isError: false, isPending: false };

    // when
    await render();

    // then
    expect(screen.isSeriesSaved).toBe(false);
  });
});

describe('useSeriesScreen — 잠긴 편(KAN-294)', () => {
  const locked = (episodeNo: number, isCompleted = false): SeriesEpisode => {
    const base = episode(episodeNo);
    return {
      ...base,
      item: { ...base.item, isCompleted, content: { ...base.item.content, isLocked: true } },
    };
  };
  const done = (episodeNo: number): SeriesEpisode => {
    const base = episode(episodeNo);
    return { ...base, item: { ...base.item, isCompleted: true } };
  };

  it('편 행 탭은 서버 잠금 값을 게이트에 넘긴다 — 판정·시트는 게이트 몫이다', async () => {
    // given
    mockQueryState = {
      data: detail([episode(1), locked(4)]),
      error: null,
      isError: false,
      isPending: false,
    };
    await render();

    // when
    await act(() => screen.handleEpisodePress(screen.episodes[1].item));

    // then
    const [target] = mockRequestPlay.mock.calls[0] as [{ contentId: string; isLocked: boolean }];
    expect(target).toMatchObject({ contentId: 'e4', isLocked: true });
  });

  it('머리 [재생]이 틀 편(다 듣지 않은 가장 앞 편)이 잠겼으면 playTarget 이 잠금이다', async () => {
    // given — 1~3화 완청, 4화 잠금
    mockQueryState = {
      data: detail([done(1), done(2), done(3), locked(4)]),
      error: null,
      isError: false,
      isPending: false,
    };

    // when
    await render();

    // then
    expect(screen.playTarget).toMatchObject({ episodeNo: 4, isLocked: true });
  });

  it('틀 편이 잠기지 않았으면 playTarget 은 잠금이 아니다', async () => {
    mockQueryState = {
      data: detail([episode(1), locked(4)]),
      error: null,
      isError: false,
      isPending: false,
    };

    await render();

    expect(screen.playTarget).toMatchObject({ episodeNo: 1, isLocked: false });
  });

  it('셔플은 섞인 순서에서 잠기지 않은 첫 편부터 튼다 — 재생 목록은 섞인 그대로 전부다', async () => {
    // given — 잠긴 편이 맨 앞으로 섞여도
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    mockQueryState = {
      data: detail([episode(1), locked(4), locked(5)]),
      error: null,
      isError: false,
      isPending: false,
    };
    await render();

    // when
    await act(() => screen.shuffleSeries());

    // then
    const [target] = mockRequestPlay.mock.calls[0] as [
      { contentId: string; queue: { items: { contentId: string }[] } },
    ];
    expect(target.contentId).toBe('e1');
    expect(target.queue.items[0].contentId).toBe('e1');
    expect(target.queue.items).toHaveLength(3);
    random.mockRestore();
  });
});
