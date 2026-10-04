import { describe, expect, it } from '@jest/globals';

import { isSignupTrialNoticeReady } from './launch-dialog-gate';

const IDLE = {
  isWalkthroughPending: false,
  isPrePromptPending: false,
  isUpdateRecommendVisible: false,
  isPushPlayConfirmVisible: false,
  isLimitNoticeVisible: false,
};

describe('isSignupTrialNoticeReady — P11 이 열려도 되는 자리', () => {
  it('앞서 뜬 안내가 하나도 없으면(기존 가입자의 평범한 앱 시작) 열린다', () => {
    expect(isSignupTrialNoticeReady(IDLE)).toBe(true);
  });

  it('신규 가입 직후 튜토리얼이 남아 있으면 기다린다', () => {
    expect(isSignupTrialNoticeReady({ ...IDLE, isWalkthroughPending: true })).toBe(false);
  });

  it('튜토리얼이 끝나도 알림 사전 안내가 남아 있으면 기다린다 — 순서는 튜토리얼 → 알림 안내 → P11', () => {
    expect(isSignupTrialNoticeReady({ ...IDLE, isPrePromptPending: true })).toBe(false);
  });

  it('실행 관문의 권장 업데이트 안내가 떠 있으면 그것이 닫힌 뒤에 열린다', () => {
    expect(isSignupTrialNoticeReady({ ...IDLE, isUpdateRecommendVisible: true })).toBe(false);
  });

  it('푸시를 눌러 들어와 재생 확인 팝업이 떠 있으면 사용자가 고른 동작이 먼저다', () => {
    expect(isSignupTrialNoticeReady({ ...IDLE, isPushPlayConfirmVisible: true })).toBe(false);
  });

  it('한도 안내 시트가 떠 있으면 겹치지 않게 기다린다', () => {
    expect(isSignupTrialNoticeReady({ ...IDLE, isLimitNoticeVisible: true })).toBe(false);
  });
});
