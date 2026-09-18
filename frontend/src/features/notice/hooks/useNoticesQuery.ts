import { useInfiniteQuery } from '@tanstack/react-query';

import { fetchNotices, noticeKeys } from '../api/notice.api';
import { NOTICE_LIST_STALE_TIME_MS, NOTICE_PAGE_SIZE } from '../notice.constants';

/**
 * 발행 공지 목록 — 커서 기반 무한 스크롤(settings-api.md 4.4). 페이지 20, 5분 stale
 * (settings.md 4.7 규칙 3·8). 정렬·발행 판정은 서버가 끝낸 것을 그대로 그린다(규칙 9).
 */
export const useNoticesQuery = () =>
  useInfiniteQuery({
    queryKey: noticeKeys.list(),
    queryFn: ({ pageParam }) =>
      fetchNotices({ cursor: pageParam ?? undefined, limit: NOTICE_PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: NOTICE_LIST_STALE_TIME_MS,
  });
