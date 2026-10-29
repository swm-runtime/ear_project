import { useEffect } from 'react';

import { useSessionStore } from '@/features/auth';

import { requestContentReviewPrompt } from '../services/content-review.service';
import { useContentReviewStore } from '../store/content-review.store';

/**
 * 라이브러리 진입 시 먼저 묻기 판정을 받는다(content-review.md 4.3 · api 4.3 — 추천 별점 판정과 나란히).
 * 앱 실행 × 계정 단위로 한 번이고(서비스가 막는다) 실패는 조용하다. 먼저 묻는 시트는 라이브러리에 들어온 세션에만 뜬다 —
 * 판정 조회는 켜짐 여부 때문에 다른 진입점 화면에서 먼저 일어날 수 있어 "들어왔다"를 따로 적는다.
 */
export const useContentReviewEntry = (): void => {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  // 무엇과 동기화하나: 로그인한 계정 → 그 계정의 이번 세션 판정(계정이 바뀌면 새로 묻는다)
  useEffect(() => {
    if (userId === null) return;
    useContentReviewStore.getState().markLibraryEntered();
    void requestContentReviewPrompt(userId);
  }, [userId]);
};
