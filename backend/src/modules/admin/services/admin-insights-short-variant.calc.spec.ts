import { InsightsShortVariantRow } from '../admin.types';
import {
  byCohort,
  byIntroVersion,
  byLengthProfile,
  variantMetrics,
  variantPairs,
  variantSplit,
} from './admin-insights-short-variant.calc';

const row = (
  contentId: string,
  counts: Partial<InsightsShortVariantRow> = {},
): InsightsShortVariantRow => ({
  contentId,
  lengthProfile: 'standard',
  introVersion: null,
  cohort: null,
  isFirst: false,
  starters: 0,
  completers: 0,
  drop10: 0,
  drop30: 0,
  drop60: 0,
  ...counts,
});

describe('짧은 판·도입부 실험 계산', () => {
  describe('variantMetrics', () => {
    it('행을 더한 뒤 완청률·이탈률은 시작자를 분모로 한다', () => {
      // given — 두 묶음 합 10명 시작, 4명 완청, 10초 2·30초 3·1분 5명 이탈
      const rows = [
        row('a', {
          starters: 6,
          completers: 3,
          drop10: 1,
          drop30: 2,
          drop60: 3,
        }),
        row('a', {
          starters: 4,
          completers: 1,
          drop10: 1,
          drop30: 1,
          drop60: 2,
        }),
      ];

      // when
      const m = variantMetrics(rows);

      // then
      expect(m).toEqual({
        starters: 10,
        completers: 4,
        completionRate: 0.4,
        drop10: 2,
        drop30: 3,
        drop60: 5,
        rate10: 0.2,
        rate30: 0.3,
        rate60: 0.5,
      });
    });

    it('시작자가 0이면 비율은 0이 아니라 null 이다', () => {
      // when
      const m = variantMetrics([]);

      // then
      expect(m.starters).toBe(0);
      expect(m.completionRate).toBeNull();
      expect(m.rate10).toBeNull();
      expect(m.rate30).toBeNull();
      expect(m.rate60).toBeNull();
    });
  });

  describe('variantSplit', () => {
    it('"첫 편 제외"는 사용자의 첫 편 묶음만 뺀다', () => {
      // given — 첫 편 묶음 5명(이탈 4), 나머지 5명(이탈 1)
      const rows = [
        row('a', { isFirst: true, starters: 5, drop60: 4 }),
        row('a', { isFirst: false, starters: 5, completers: 3, drop60: 1 }),
      ];

      // when
      const s = variantSplit(rows);

      // then
      expect(s.all.starters).toBe(10);
      expect(s.all.rate60).toBe(0.5);
      expect(s.excludingFirst.starters).toBe(5);
      expect(s.excludingFirst.rate60).toBe(0.2);
      expect(s.excludingFirst.completionRate).toBe(0.6);
    });

    it('첫 편뿐이면 "첫 편 제외"는 시작자 0 · 비율 null 이다', () => {
      // when
      const s = variantSplit([row('a', { isFirst: true, starters: 3 })]);

      // then
      expect(s.excludingFirst.starters).toBe(0);
      expect(s.excludingFirst.completionRate).toBeNull();
    });
  });

  describe('byCohort', () => {
    it('경계가 없으면 null 이다(경계 미설정)', () => {
      expect(byCohort([row('a', { starters: 1 })], false)).toBeNull();
    });

    it('standard·short 두 행을 내고, 창 밖 가입자(cohort null)는 넣지 않는다', () => {
      // given
      const rows = [
        row('a', { cohort: 'standard', starters: 2, completers: 1 }),
        row('b', { cohort: 'short', starters: 4, completers: 3 }),
        row('a', { cohort: null, starters: 100 }),
      ];

      // when
      const groups = byCohort(rows, true);

      // then
      expect(
        groups?.map((g) => [g.key, g.all.starters, g.all.completionRate]),
      ).toEqual([
        ['standard', 2, 0.5],
        ['short', 4, 0.75],
      ]);
    });

    it('한쪽 코호트에 아무도 없어도 행은 나오고 비율은 null 이다', () => {
      // when
      const groups = byCohort(
        [row('a', { cohort: 'standard', starters: 1 })],
        true,
      );

      // then
      expect(groups?.[1]).toMatchObject({
        key: 'short',
        all: { starters: 0, completionRate: null },
      });
    });
  });

  describe('byLengthProfile', () => {
    it('코호트와 무관하게 콘텐츠의 길이 프로필로 묶고 두 행을 늘 낸다', () => {
      // given
      const rows = [
        row('a', { lengthProfile: 'standard', cohort: null, starters: 3 }),
        row('a', {
          lengthProfile: 'standard',
          cohort: 'standard',
          starters: 2,
        }),
      ];

      // when
      const groups = byLengthProfile(rows);

      // then
      expect(groups.map((g) => [g.key, g.all.starters])).toEqual([
        ['standard', 5],
        ['short', 0],
      ]);
    });
  });

  describe('byIntroVersion', () => {
    it('기존 도입부(null)가 늘 맨 앞이고 나머지는 이름 순이다', () => {
      // given
      const rows = [
        row('a', { introVersion: 'hook-v3', starters: 1 }),
        row('b', { introVersion: 'hook-v2', starters: 2, drop10: 1 }),
      ];

      // when
      const groups = byIntroVersion(rows);

      // then
      expect(groups.map((g) => [g.key, g.all.starters, g.all.rate10])).toEqual([
        [null, 0, null],
        ['hook-v2', 2, 0.5],
        ['hook-v3', 1, 0],
      ]);
    });
  });

  describe('variantPairs', () => {
    const pair = (n: string) => ({
      shortContentId: `s${n}`,
      shortTitle: `짧은 ${n}`,
      shortDurationSec: 420,
      shortIntroVersion: 'hook-v2',
      originalContentId: `o${n}`,
      originalTitle: `원본 ${n}`,
      originalDurationSec: 900,
      originalIntroVersion: null,
    });

    it('짝마다 두 편의 값을 붙이고, 짧은 판 시작자 많은 순으로 놓는다', () => {
      // given — 짝 1의 짧은 판은 아무도 안 들었고, 짝 2는 2명
      const rows = [
        row('s2', { lengthProfile: 'short', starters: 2, completers: 2 }),
        row('o2', { starters: 4, completers: 1, drop30: 2 }),
        row('o1', { starters: 1 }),
      ];

      // when
      const pairs = variantPairs(rows, [pair('1'), pair('2')]);

      // then
      expect(pairs.map((p) => p.short.contentId)).toEqual(['s2', 's1']);
      expect(pairs[0]).toMatchObject({
        short: {
          title: '짧은 2',
          durationSec: 420,
          introVersion: 'hook-v2',
          all: { completionRate: 1 },
        },
        original: {
          contentId: 'o2',
          all: { starters: 4, completionRate: 0.25, rate30: 0.5 },
        },
      });
      expect(pairs[1].short.all).toMatchObject({
        starters: 0,
        completionRate: null,
      });
    });
  });
});
