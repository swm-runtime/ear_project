import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';

import type { QueueEntry } from '../player.types';
import { UP_NEXT_MAX_ITEMS, useUpNextQuery } from './useUpNextQuery';

let mockServed = 0;
const mockFetchUpNext = jest.fn(async (): Promise<QueueEntry[]> => {
  // 부를 때마다 처음 보는 10편 — 끝없는 추천
  const page = Array.from({ length: 10 }, (_, index) => {
    const contentId = `up-${mockServed + index}`;
    return {
      itemId: null,
      contentId,
      title: contentId,
      authorName: null,
      sourceName: null,
      thumbnailUrl: null,
      durationSec: 300,
      isCountedToday: false,
      isCompleted: false,
      topicIds: [],
    };
  });
  mockServed += 10;
  return page;
});
jest.mock('../services/player-library.bridge', () => ({
  getPlayerLibraryBridge: () => ({ fetchUpNext: mockFetchUpNext }),
}));

const { act, create } = jest.requireActual<{
  act(callback: () => Promise<void> | void): Promise<void>;
  create(element: ReactNode): { update(element: ReactNode): void; unmount(): void };
}>('react-test-renderer');

let result: ReturnType<typeof useUpNextQuery>;
function Probe({ excludeIds }: { excludeIds: string[] }) {
  const current = useUpNextQuery('now', excludeIds, true);
  useEffect(() => {
    result = current;
  });
  return null;
}

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const mount = async (excludeIds: string[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const tree = (ids: string[]) => (
    <QueryClientProvider client={client}>
      <Probe excludeIds={ids} />
    </QueryClientProvider>
  );
  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(tree(excludeIds));
  });
  await flush();
  return {
    update: async (ids: string[]) => {
      await act(async () => {
        renderer?.update(tree(ids));
      });
      await flush();
    },
    unmount: async () => {
      await act(() => {
        renderer?.unmount();
      });
    },
  };
};

describe('useUpNextQuery — "다음에 들어볼 만한"(KAN-260)', () => {
  afterEach(() => {
    mockServed = 0;
    mockFetchUpNext.mockClear();
  });

  it(`추천은 ${UP_NEXT_MAX_ITEMS}편에서 멈추고 더 잇지 않는다`, async () => {
    const view = await mount([]);
    expect(result.items).toHaveLength(10);
    for (let page = 0; page < 10; page += 1) {
      await act(async () => {
        result.fetchMore();
      });
      await flush();
    }
    expect(result.items).toHaveLength(UP_NEXT_MAX_ITEMS);
    expect(result.hasMore).toBe(false);
    expect(mockFetchUpNext).toHaveBeenCalledTimes(UP_NEXT_MAX_ITEMS / 10);
    await view.unmount();
  });

  it('다음 장 받기는 렌더가 바뀌어도 같은 함수다 — 바닥 판정이 렌더마다 다시 돌지 않게', async () => {
    const view = await mount(['a']);
    const first = result.fetchMore;
    await view.update(['a']);
    expect(result.fetchMore).toBe(first);
    await view.unmount();
  });

  it('위 목록이 바뀌어도(줄 삭제·담기) 처음부터 다시 받지 않고, 목록에 든 편은 거른다', async () => {
    const view = await mount(['a', 'b']);
    await act(async () => {
      result.fetchMore();
    });
    await flush();
    expect(result.items).toHaveLength(20);
    const calls = mockFetchUpNext.mock.calls.length;
    // b 를 지웠다 — 키가 그대로라 다시 받지 않는다
    await view.update(['a']);
    expect(mockFetchUpNext).toHaveBeenCalledTimes(calls);
    expect(result.items).toHaveLength(20);
    // 추천 줄 up-3 을 담아 목록에 들어갔다 — 추천에서 빠진다
    await view.update(['a', 'up-3']);
    expect(result.items.map((item) => item.contentId)).not.toContain('up-3');
    expect(result.items).toHaveLength(19);
    await view.unmount();
  });
});
