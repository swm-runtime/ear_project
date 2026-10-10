import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import { track } from '@/shared/analytics';

import { libraryKeys } from '../api/library.api';
import { LIBRARY_COPY } from '../library.copy';
import { hoursSinceArrival } from '../library.new-arrival';
import { useLibraryItemsQuery } from './useLibraryItemsQuery';
import { useLibraryArrivalStore } from '../store/library-arrival.store';

/**
 * 탭 내비게이터에 붙인다 — 라이브러리를 아직 열지 않았거나 필터를 걸어도 새 도착을 관측한다.
 * 기본 목록과 같은 쿼리라 요청·캐시를 공유하며, 푸시는 bootstrap이 이 쿼리를 무효화한다.
 */
export const useLibraryArrivalBadge = () => {
  const queryClient = useQueryClient();
  const query = useLibraryItemsQuery('all', [], null);
  const count = useLibraryArrivalStore((state) => state.count);

  useEffect(() => {
    const firstPage = query.data?.pages[0];
    if (!firstPage) return;
    const { baseline, newCount } = useLibraryArrivalStore.getState().observe(firstPage.items);
    if (newCount > 0) {
      track('drip_arrival_view', {
        count: newCount,
        hours_since_arrival: hoursSinceArrival(baseline),
      });
    }
  }, [query.data, query.dataUpdatedAt]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    });
    return () => subscription.remove();
  }, [queryClient]);

  const acknowledge = useCallback(() => {
    const store = useLibraryArrivalStore.getState();
    if (store.count === 0) return;
    store.acknowledge();
    // 기존 포그라운드 알림 탭 이벤트 이름은 분석 호환을 위해 유지한다.
    track('push_foreground_banner', { action: 'tap' });
    void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
  }, [queryClient]);

  return {
    value: count > 0 ? (count > 99 ? '99+' : count) : undefined,
    accessibilityLabel: count > 0 ? LIBRARY_COPY.arrivalBadge.a11y(count) : LIBRARY_COPY.tabTitle,
    acknowledge,
  };
};
