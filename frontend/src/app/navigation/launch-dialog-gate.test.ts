import { describe, expect, it } from '@jest/globals';

import { isDripFeedbackPromptReady, isSignupTrialNoticeReady } from './launch-dialog-gate';

const IDLE = {
  isPrePromptPending: false,
  isUpdateRecommendVisible: false,
  isPushPlayConfirmVisible: false,
  isLimitNoticeVisible: false,
  isDripFeedbackVisible: false,
};

describe('isSignupTrialNoticeReady — P11 이 열려도 되는 자리', () => {
  it('앞서 뜬 안내가 하나도 없으면(기존 가입자의 평범한 앱 시작) 열린다', () => {
    expect(isSignupTrialNoticeReady(IDLE)).toBe(true);
  });

  it('신규 가입 직후 알림 사전 안내가 남아 있으면 기다린다 — 순서는 알림 안내 → P11', () => {
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

describe('isDripFeedbackPromptReady — 추천 별점 팝업(KAN-224)이 열려도 되는 자리', () => {
  const DRIP_IDLE = {
    isPrePromptPending: false,
    isUpdateRecommendVisible: false,
    isPushPlayConfirmVisible: false,
    isLimitNoticeVisible: false,
    isSignupTrialNoticeActive: false,
  };

  it('앞서 뜬 팝업이 하나도 없으면 열린다', () => {
    expect(isDripFeedbackPromptReady(DRIP_IDLE)).toBe(true);
  });

  it('권장 업데이트·푸시 재생 확인·한도 안내·알림 사전 안내 중 하나라도 있으면 기다린다', () => {
    expect(isDripFeedbackPromptReady({ ...DRIP_IDLE, isUpdateRecommendVisible: true })).toBe(false);
    expect(isDripFeedbackPromptReady({ ...DRIP_IDLE, isPushPlayConfirmVisible: true })).toBe(false);
    expect(isDripFeedbackPromptReady({ ...DRIP_IDLE, isLimitNoticeVisible: true })).toBe(false);
    expect(isDripFeedbackPromptReady({ ...DRIP_IDLE, isPrePromptPending: true })).toBe(false);
  });

  it('가입 체험 안내가 뜰 차례이거나 떠 있으면 그 뒤에 연다', () => {
    expect(isDripFeedbackPromptReady({ ...DRIP_IDLE, isSignupTrialNoticeActive: true })).toBe(
      false,
    );
  });

  it('별점 팝업이 떠 있으면 가입 체험 안내가 기다린다 — 둘이 동시에 뜨지 않는다', () => {
    expect(isSignupTrialNoticeReady({ ...IDLE, isDripFeedbackVisible: true })).toBe(false);
  });
});
