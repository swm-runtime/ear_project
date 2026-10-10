import { UserTier } from '@/modules/user/user.enum';

import {
  INVITE_CODE_PATTERN,
  generateInviteCode,
  higherTier,
  normalizeInviteCode,
  resolveInviteGrantEndsAt,
  toInviteGrantLastDate,
} from './invite-code.policy';

describe('invite-code.policy', () => {
  it('입력은 앞뒤 공백을 지우고 대문자로 맞춘다 — 소문자로 쳐도 같은 코드다', () => {
    expect(normalizeInviteCode('  sangun-poc ')).toBe('SANGUN-POC');
  });

  it('자동 생성 코드는 8자이고 저장 규칙을 지키며 헷갈리는 문자(0·O·1·I·L)가 없다', () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(INVITE_CODE_PATTERN);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('티어는 무료(체험 포함) < Daily < Pro 순으로 높은 쪽을 고른다', () => {
    expect(higherTier(UserTier.LIGHT, UserTier.PRO)).toBe(UserTier.PRO);
    expect(higherTier(UserTier.PRO, UserTier.DAILY)).toBe(UserTier.PRO);
    expect(higherTier(UserTier.DAILY, UserTier.TRIAL)).toBe(UserTier.DAILY);
    expect(higherTier(UserTier.DAILY, UserTier.DAILY)).toBe(UserTier.DAILY);
  });

  it('일수 지급은 입력한 서비스 날짜를 1일째로 세어 N일째 다음 경계(04:00 KST)에 끝난다', () => {
    // 10월 10일 15:00 KST 입력 · 30일 → 10월 10일~11월 8일, 11월 9일 04:00 KST에 끝난다
    const endsAt = resolveInviteGrantEndsAt(
      { grantDays: 30, grantUntilDate: null },
      new Date('2026-10-10T06:00:00Z'),
    );

    expect(endsAt.toISOString()).toBe('2026-11-08T19:00:00.000Z');
    expect(toInviteGrantLastDate(endsAt)).toBe('2026-11-08');
  });

  it('새벽(경계 전) 입력은 전날 서비스 날짜가 1일째다', () => {
    // 10월 10일 02:00 KST는 10월 9일 서비스 날짜 → 7일이면 10월 15일까지
    const endsAt = resolveInviteGrantEndsAt(
      { grantDays: 7, grantUntilDate: null },
      new Date('2026-10-09T17:00:00Z'),
    );

    expect(toInviteGrantLastDate(endsAt)).toBe('2026-10-15');
  });

  it('마지막 날 지급은 그 서비스 날짜의 다음 경계에 끝난다 — 입력한 날과 무관하다', () => {
    const endsAt = resolveInviteGrantEndsAt(
      { grantDays: null, grantUntilDate: '2026-12-31' },
      new Date('2026-10-10T06:00:00Z'),
    );

    expect(endsAt.toISOString()).toBe('2026-12-31T19:00:00.000Z');
    expect(toInviteGrantLastDate(endsAt)).toBe('2026-12-31');
  });
});
