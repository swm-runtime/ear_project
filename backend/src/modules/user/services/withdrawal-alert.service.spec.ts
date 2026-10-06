import { WithdrawalReason } from '../user.enum';
import {
  formatWithdrawalText,
  REASON_TEXT_MAX_LENGTH,
} from './withdrawal-alert.service';

/** 알림 문구 — 채널에 그대로 찍히는 값이라 모양과 **담기지 않는 것**을 함께 고정한다 */
describe('formatWithdrawalText', () => {
  // 2026-10-06 00:12 UTC = 09:12 KST
  const at = new Date('2026-10-06T00:12:00Z');
  const base = {
    reasonCode: WithdrawalReason.APP_ISSUE,
    reasonText: null,
    // 12일 전 가입 → 13일차
    signedUpAt: new Date('2026-09-24T00:12:00Z'),
    hadPaymentHistory: false,
  };

  it('사유를 화면 문구 그대로 적고, 가입 며칠째인지와 KST 시각을 함께 적는다', () => {
    expect(formatWithdrawalText(base, at)).toBe(
      ':door: 탈퇴 · 앱 오류나 사용이 불편했어요 · 가입 13일차 · 10. 06. 09:12',
    );
  });

  it('직접 입력 사유는 둘째 줄에 인용으로 붙인다 — 그 문장이 팀이 들어야 할 목소리다', () => {
    const text = formatWithdrawalText(
      {
        ...base,
        reasonCode: WithdrawalReason.OTHER,
        reasonText: ' 재생이 자꾸 끊겨요\n지하철에서요 ',
      },
      at,
    );

    expect(text.split('\n')).toEqual([
      ':door: 탈퇴 · 기타 · 가입 13일차 · 10. 06. 09:12',
      '> 재생이 자꾸 끊겨요 지하철에서요',
    ]);
  });

  it('직접 입력 사유가 길면 자른다 — Slack 한 줄에 읽히는 길이', () => {
    const text = formatWithdrawalText(
      { ...base, reasonText: 'ㄱ'.repeat(REASON_TEXT_MAX_LENGTH + 50) },
      at,
    );

    expect(text.split('\n')[1]).toBe(
      `> ${'ㄱ'.repeat(REASON_TEXT_MAX_LENGTH)}…`,
    );
  });

  it('사유를 고르지 않았으면 그렇다고 적는다 — 조용히 비는 것보다 낫다', () => {
    expect(formatWithdrawalText({ ...base, reasonCode: null }, at)).toContain(
      '사유 미선택',
    );
  });

  it('결제 이력이 있으면 표시한다 — 돈을 낸 사용자의 이탈은 따로 봐야 한다', () => {
    expect(
      formatWithdrawalText({ ...base, hadPaymentHistory: true }, at),
    ).toContain(' · 결제 이력 있음 · ');
    expect(formatWithdrawalText(base, at)).not.toContain('결제 이력');
  });

  it('가입 당일 탈퇴는 1일차다', () => {
    expect(
      formatWithdrawalText(
        { ...base, signedUpAt: new Date(at.getTime() - 1000) },
        at,
      ),
    ).toContain('가입 1일차');
  });

  it('신원 값을 담지 않는다 — 사유·일차·시각뿐이다', () => {
    const text = formatWithdrawalText(base, at);
    expect(text).not.toMatch(/@|user_id|[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});
