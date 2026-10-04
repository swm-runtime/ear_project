import { describe, expect, it } from '@jest/globals';

import { toDateOnlyMonthDay } from './date-only';

describe('toDateOnlyMonthDay', () => {
  it('YYYY-MM-DD 를 시간대를 거치지 않고 월·일로 나눈다', () => {
    // given — 가입 체험의 마지막 무제한 날(profile-api.md 4.1 예시)
    // when
    const parts = toDateOnlyMonthDay('2026-10-09');
    // then
    expect(parts).toEqual({ month: 10, day: 9 });
  });

  it('달의 첫날도 하루 앞당기지 않는다 — UTC 자정 파싱이면 서쪽 시간대에서 전달 말일이 된다', () => {
    expect(toDateOnlyMonthDay('2026-11-01')).toEqual({ month: 11, day: 1 });
  });
});
