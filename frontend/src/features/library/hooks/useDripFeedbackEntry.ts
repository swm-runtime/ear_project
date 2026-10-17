import { useEffect } from 'react';

import { useSessionStore } from '@/features/auth';

import { requestDripFeedbackPrompt } from '../services/drip-feedback.service';

/**
 * 라이브러리 진입 시 추천 별점 팝업의 노출 판정을 받는다(drip-feedback.md 2장 — KAN-224). 한 세션에 한 번이고(서비스가 막는다)
 * 실패는 조용하다 — 라이브러리 화면의 다른 동작과 무관하다.
 */
export const useDripFeedbackEntry = (): void => {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  // 무엇과 동기화하나: 로그인한 계정 → 그 계정의 이번 세션 판정(계정이 바뀌면 새로 묻는다)
  useEffect(() => {
    if (userId !== null) void requestDripFeedbackPrompt(userId);
  }, [userId]);
};
