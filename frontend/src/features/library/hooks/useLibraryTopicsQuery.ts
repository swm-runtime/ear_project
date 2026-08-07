import { useQuery } from '@tanstack/react-query';

import { fetchLibraryTopics, libraryKeys } from '../api/library.api';

/** 주제 필터 시트가 열릴 때만 조회한다 — 탭 선택과 무관하게 라이브러리 전체 기준(library-api.md 4.2) */
export const useLibraryTopicsQuery = (enabled: boolean) =>
  useQuery({
    queryKey: libraryKeys.topics(),
    queryFn: fetchLibraryTopics,
    enabled,
  });
