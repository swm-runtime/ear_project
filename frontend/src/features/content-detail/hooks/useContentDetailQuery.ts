import { useQuery } from '@tanstack/react-query';

import { contentDetailKeys, fetchContentDetail } from '../api/content-detail.api';

/**
 * 단건 상세 조회(content-detail-api.md 4.1). 진입 시 재조회가 규칙이라(content-detail.md 4.1 —
 * 최신 status·담김 여부) 화면이 떠나면 캐시를 남기지 않는다(gcTime 0). 이전 방문의 캐시로
 * 화면을 먼저 그리면 회수 반영 이전의 상세가 잠깐 보인다.
 */
export const useContentDetailQuery = (contentId: string) =>
  useQuery({
    queryKey: contentDetailKeys.detail(contentId),
    queryFn: () => fetchContentDetail({ contentId }),
    gcTime: 0,
  });
