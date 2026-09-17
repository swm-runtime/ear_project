import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';

import { noticeKeys } from '../api/notice.api';
import type { NoticeSummary } from '../notice.types';
import { useNoticesQuery } from './useNoticesQuery';

/**
 * 공지 목록 화면(S8·S10·S11)의 로직 소유자 — 화면은 뷰만 담당한다.
 * 정렬·발행 판정은 서버 몫이다(settings.md 4.7 규칙 9) — 여기서는 페이지를 잇고 이동만 한다.
 */
export const useNoticeListScreen = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const query = useNoticesQuery();

  /** 당겨서 새로고침 인플라이트 — 첫 로딩 스켈레톤·[다시 시도] 스피너와 구분해 표시한다 */
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const items = useMemo<NoticeSummary[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const isInitialLoading = query.isPending;
  /** 첫 페이지 실패만 전면 오류다 — 다음 페이지 실패는 목록을 유지하고 끝에서 재시도한다(common-error-handling.md 4.3) */
  const isFullError = query.isError && query.data === undefined;
  const isLoadMoreFailed = query.isFetchNextPageError;

  /** 목록 새로고침은 id 별 상세 캐시도 함께 무효화한다(settings.md 4.7 규칙 8) */
  const refresh = async (): Promise<void> => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: noticeKeys.details() }),
      ]);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const loadMore = (): void => {
    // 실패 직후의 onEndReached 재진입으로 자동 재시도하지 않는다 — [다시 시도]가 재시도 경로다
    if (!query.hasNextPage || query.isFetchingNextPage || isLoadMoreFailed) return;
    void query.fetchNextPage();
  };

  const retryLoadMore = (): void => {
    if (query.isFetchingNextPage) return;
    void query.fetchNextPage();
  };

  /** S11 [다시 시도] — 인플라이트 중 연타는 무시한다(common-error-handling.md 7) */
  const retry = (): void => {
    if (query.isFetching) return;
    void query.refetch();
  };

  const openNotice = (noticeId: string): void => {
    navigation.navigate('Main', { screen: 'NoticeDetail', params: { noticeId } });
  };

  return {
    items,
    isInitialLoading,
    /** 행 스켈레톤 — 0.3초 미만이면 표시하지 않는다(settings-uiux.md 4.7 S8) */
    showSkeleton: useDelayedVisible(isInitialLoading),
    isEmpty: !isInitialLoading && !isFullError && items.length === 0,
    isFullError,
    isRetrying: query.isFetching && !isManualRefreshing,
    isManualRefreshing,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoadMoreFailed,
    refresh,
    loadMore,
    retryLoadMore,
    retry,
    openNotice,
    goBack: () => navigation.goBack(),
  };
};
