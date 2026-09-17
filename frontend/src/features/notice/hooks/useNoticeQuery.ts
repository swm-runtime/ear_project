import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { fetchNotice, noticeKeys } from '../api/notice.api';
import type { NoticePage, NoticeSummary } from '../notice.types';

/**
 * 목록 캐시에서 해당 공지의 요약(제목·날짜·고정)을 찾는다 — 상세는 이 값을 즉시 그리고 본문만
 * 기다린다(settings.md 4.7 규칙 4: 빈 화면 뒤 로딩이 아니다). 목록을 거치지 않은 진입(딥링크
 * 등)에는 null이다.
 */
const findCachedNoticeSummary = (
  pages: InfiniteData<NoticePage> | undefined,
  noticeId: string,
): NoticeSummary | null => {
  if (pages === undefined) return null;
  for (const page of pages.pages) {
    const found = page.items.find((item) => item.id === noticeId);
    if (found !== undefined) return found;
  }
  return null;
};

/**
 * 공지 상세 조회(settings-api.md 4.5) — id 별 캐시. 목록 새로고침이 noticeKeys.details()를
 * 무효화하므로 여기서 따로 stale을 두지 않는다(규칙 8).
 *
 * 반환값의 cachedSummary는 목록 캐시에서 읽은 요약이다 — placeholderData로 넣지 않는 이유는
 * NoticeDetail의 body가 필수라 가짜 본문을 캐시 형태로 흘리게 되기 때문이다. 화면 훅이
 * `query.data ?? cachedSummary`로 헤더를 그리고 본문 자리만 스켈레톤으로 둔다.
 */
export const useNoticeQuery = (noticeId: string) => {
  const queryClient = useQueryClient();
  const cachedSummary = findCachedNoticeSummary(
    queryClient.getQueryData<InfiniteData<NoticePage>>(noticeKeys.list()),
    noticeId,
  );
  const query = useQuery({
    queryKey: noticeKeys.detail(noticeId),
    queryFn: () => fetchNotice(noticeId),
  });
  return { query, cachedSummary };
};
