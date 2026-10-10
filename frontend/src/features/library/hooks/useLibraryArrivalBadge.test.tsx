import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useLibraryArrivalBadge } from './useLibraryArrivalBadge';
import { useLibraryItemsQuery } from './useLibraryItemsQuery';
import { useLibraryArrivalStore } from '../store/library-arrival.store';

const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock('@/shared/analytics', () => ({ track: jest.fn() }));
jest.mock('../api/library.api', () => ({ libraryKeys: { all: ['library'] } }));
jest.mock('./useLibraryItemsQuery', () => ({ useLibraryItemsQuery: jest.fn() }));

const { act, create } = jest.requireActual<{
  act: (callback: () => Promise<void>) => Promise<void>;
  create: (node: ReactNode) => { update: (node: ReactNode) => void; unmount: () => void };
}>('react-test-renderer');
const queryMock = jest.mocked(useLibraryItemsQuery);
const old = { source: 'drip', addedAt: '2026-10-10T01:00:00Z' };
let badge: ReturnType<typeof useLibraryArrivalBadge>;
function Probe() {
  const currentBadge = useLibraryArrivalBadge();
  useEffect(() => {
    badge = currentBadge;
  }, [currentBadge]);
  return null;
}
const response = (items: unknown[], dataUpdatedAt: number) => {
  queryMock.mockReturnValue({ data: { pages: [{ items }] }, dataUpdatedAt } as ReturnType<
    typeof useLibraryItemsQuery
  >);
};

beforeEach(() => {
  jest.clearAllMocks();
  useLibraryArrivalStore.getState().reset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('라이브러리 화면 밖의 탭 배지 관측', () => {
  it('필터 없는 목록을 관측하고, 재조회로 도착한 2편을 표시한 뒤 탭 확인으로 없앤다', async () => {
    const onForeground = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onForeground.mockImplementation(() => listener('active'));
      return { remove: jest.fn() };
    });
    response([old], 1);
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Probe />);
    });
    expect(queryMock).toHaveBeenCalledWith('all', [], null);
    expect(badge.value).toBeUndefined();
    response(
      [
        { source: 'drip', addedAt: '2026-10-11T01:00:00Z' },
        { source: 'discovery', addedAt: '2026-10-11T01:01:00Z' },
        old,
      ],
      2,
    );
    await act(async () => {
      renderer.update(<Probe />);
    });
    expect(badge.value).toBe(2);
    expect(badge.accessibilityLabel).toBe('라이브러리, 새 콘텐츠 2편 도착');
    await act(async () => {
      badge.acknowledge();
    });
    expect(badge.value).toBeUndefined();
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['library'] });
    await act(async () => {
      renderer.update(<Probe />);
    });
    expect(badge.value).toBeUndefined();
    onForeground();
    expect(mockInvalidate).toHaveBeenCalledTimes(2);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('100편 이상은 99+로 표시하되 접근성 라벨은 실제 수를 읽는다', async () => {
    response([old], 1);
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Probe />);
    });
    await act(async () => {
      useLibraryArrivalStore.setState({ count: 100 });
    });
    expect(badge.value).toBe('99+');
    expect(badge.accessibilityLabel).toContain('100편');
    await act(async () => {
      renderer.unmount();
    });
  });
});
