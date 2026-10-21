import { describe, expect, it } from '@jest/globals';

import {
  daysBetweenDateLabels,
  formatDateLabelMonthDay,
  formatEnCount,
  formatFullDate,
  formatInstantMonthDay,
  formatLocaleOf,
  formatMonthDay,
  parseDateLabel,
  selectPlural,
  toLocalDate,
} from './format';

describe('formatLocaleOf — 표기 로캘', () => {
  it('기기 로캘이 표시 언어와 같은 언어면 기기 로캘을 따른다', () => {
    expect(formatLocaleOf('en', 'en-GB')).toBe('en-GB');
    expect(formatLocaleOf('ko', 'ko-KR')).toBe('ko-KR');
  });

  it('다른 언어 기기(일본어 기기에서 영어 표시)면 그 언어의 기본 로캘', () => {
    expect(formatLocaleOf('en', 'ja-JP')).toBe('en-US');
    expect(formatLocaleOf('ko', 'en-US')).toBe('ko-KR');
  });
});

describe('달력 날짜(서버 날짜 라벨) — 시간대를 거치지 않는다', () => {
  it('YYYY-MM-DD 를 연·월·일로 나눈다', () => {
    expect(parseDateLabel('2026-10-05')).toEqual({ year: 2026, month: 10, day: 5 });
  });

  it('한국어는 종전 문자열 그대로 "N월 N일"', () => {
    expect(formatDateLabelMonthDay('2026-10-05', 'ko')).toBe('10월 5일');
    expect(formatFullDate({ year: 2026, month: 1, day: 9 }, 'ko')).toBe('2026년 1월 9일');
  });

  it('영어는 Intl — en-US "Oct 5" · en-GB "5 Oct"', () => {
    expect(formatDateLabelMonthDay('2026-10-05', 'en', 'en-US')).toBe('Oct 5');
    expect(formatDateLabelMonthDay('2026-10-05', 'en', 'en-GB')).toBe('5 Oct');
    expect(formatFullDate({ year: 2026, month: 10, day: 5 }, 'en', 'en-US')).toBe('Oct 5, 2026');
  });

  it('America/New_York 기기에서도 라벨 날짜가 하루 밀리지 않는다', () => {
    // 함정: new Date('2026-10-05') 는 UTC 자정이라 뉴욕 시간대로 읽으면 10월 4일이다
    expect(toLocalDate(new Date('2026-10-05').toISOString(), 'America/New_York')).toEqual({
      year: 2026,
      month: 10,
      day: 4,
    });
    // 라벨 표기는 UTC 로 포맷해 기기 시간대와 무관하다
    expect(formatDateLabelMonthDay('2026-10-05', 'en', 'en-US')).toBe('Oct 5');
    expect(formatDateLabelMonthDay('2026-10-05', 'ko')).toBe('10월 5일');
  });

  it('윤일도 그린다', () => {
    expect(formatMonthDay({ year: 2028, month: 2, day: 29 }, 'en', 'en-US')).toBe('Feb 29');
  });

  it('라벨끼리의 날 수 — 달·해를 넘어도 정수(서머타임 전환 주 포함)', () => {
    expect(daysBetweenDateLabels('2026-10-26', '2026-11-01')).toBe(6);
    expect(daysBetweenDateLabels('2026-12-28', '2027-01-03')).toBe(6);
    expect(daysBetweenDateLabels('2026-10-12', '2026-10-11')).toBe(-1);
  });
});

describe('순간(ISO UTC) — 기기 시간대의 날짜로 그린다', () => {
  const ISO = '2026-10-15T02:00:00.000Z';

  it('Asia/Seoul 기기는 그 시각의 한국 날짜(10월 15일)', () => {
    const seoul = toLocalDate(ISO, 'Asia/Seoul');
    expect(formatMonthDay(seoul, 'ko')).toBe('10월 15일');
    expect(formatMonthDay(seoul, 'en', 'en-US')).toBe('Oct 15');
  });

  it('America/New_York 기기는 현지 날짜(10월 14일 22시 → Oct 14)', () => {
    expect(formatMonthDay(toLocalDate(ISO, 'America/New_York'), 'en', 'en-US')).toBe('Oct 14');
  });

  it('시간대를 주지 않으면 기기(엔진) 시간대 — 종전 getMonth()·getDate() 표기와 같다', () => {
    const local = new Date(ISO);
    expect(formatInstantMonthDay(ISO, 'ko')).toBe(`${local.getMonth() + 1}월 ${local.getDate()}일`);
  });
});

describe('복수형 — Intl.PluralRules', () => {
  it('영어 1 은 one, 그 밖은 other', () => {
    expect(selectPlural(1, 'en-US')).toBe('one');
    expect(selectPlural(0, 'en-US')).toBe('other');
    expect(selectPlural(2, 'en-US')).toBe('other');
  });

  it('수량 문장 "1 episode" · "3 episodes"', () => {
    const forms = { one: 'episode', other: 'episodes' };
    expect(formatEnCount(1, forms, 'en-US')).toBe('1 episode');
    expect(formatEnCount(3, forms, 'en-US')).toBe('3 episodes');
    expect(formatEnCount(0, forms, 'en-US')).toBe('0 episodes');
  });

  it('PluralRules 가 없는 엔진(Hermes 일부 버전)도 영어 규칙으로 폴백한다', () => {
    // 엔진에 PluralRules 가 없는 경우를 흉내 낸다(읽기 전용 타입이라 느슨한 객체로 바꿔 끼운다)
    const intl = Intl as unknown as { PluralRules: unknown };
    const original = intl.PluralRules;
    try {
      intl.PluralRules = undefined;
      expect(selectPlural(1, 'en-US')).toBe('one');
      expect(selectPlural(5, 'en-US')).toBe('other');
    } finally {
      intl.PluralRules = original;
    }
  });
});
