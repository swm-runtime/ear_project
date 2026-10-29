import { describe, expect, it } from '@jest/globals';

import { decideContentReviewPromptStep } from './prompt-gate';

const READY = {
  phase: 'pending' as const,
  isLibraryEntered: true,
  isDripFeedbackSettled: true,
  wasDripFeedbackShown: false,
  isReady: true,
};

describe('decideContentReviewPromptStep — 먼저 묻는 시트(L18)의 차례(content-review.md 4.3)', () => {
  it('서버가 show=true 를 줬고 라이브러리에 들어왔고 추천 별점 판정이 끝났고 앞선 팝업이 없으면 띄운다', () => {
    expect(decideContentReviewPromptStep(READY)).toBe('reveal');
  });

  it('같은 세션에 추천 별점 팝업이 떴으면 건너뛴다 — 다시 라이브러리에 들어와도 뜨지 않는다', () => {
    expect(decideContentReviewPromptStep({ ...READY, wasDripFeedbackShown: true })).toBe('skip');
  });

  it('추천 별점 판정이 아직이면(뜰 수도 있다) 기다린다 — 추천 별점이 먼저다', () => {
    expect(decideContentReviewPromptStep({ ...READY, isDripFeedbackSettled: false })).toBe('wait');
  });

  it('라이브러리에 들어오지 않은 세션(다른 탭에서 켜짐만 물었다)은 기다린다', () => {
    expect(decideContentReviewPromptStep({ ...READY, isLibraryEntered: false })).toBe('wait');
  });

  it('앞선 팝업 · 플레이어가 있으면 기다린다 — 플레이어 화면 · 완청 순간에는 묻지 않는다', () => {
    expect(decideContentReviewPromptStep({ ...READY, isReady: false })).toBe('wait');
  });

  it('show=false · 이미 끝남 · 아직 조회 중이면 아무것도 하지 않는다', () => {
    expect(decideContentReviewPromptStep({ ...READY, phase: 'done' })).toBe('wait');
    expect(decideContentReviewPromptStep({ ...READY, phase: 'loading' })).toBe('wait');
    expect(decideContentReviewPromptStep({ ...READY, phase: 'visible' })).toBe('wait');
  });
});
