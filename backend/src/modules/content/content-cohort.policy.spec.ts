import {
  cohortLengthProfileSql,
  parseShortContentCohortSince,
  resolveContentLengthProfile,
} from './content-cohort.policy';
import { ContentLengthProfile } from './content.enum';

const SINCE = new Date('2026-11-05T01:00:00.000Z');

describe('content-cohort.policy — 짧은 판 코호트(KAN-298)', () => {
  describe('parseShortContentCohortSince', () => {
    it('비었거나 공백이면 null(전원 standard)이다', () => {
      expect(parseShortContentCohortSince(undefined)).toBeNull();
      expect(parseShortContentCohortSince('')).toBeNull();
      expect(parseShortContentCohortSince('   ')).toBeNull();
    });

    it('오프셋이 붙은 ISO 시각을 그대로 읽는다', () => {
      expect(
        parseShortContentCohortSince('2026-11-05T10:00:00+09:00')?.getTime(),
      ).toBe(SINCE.getTime());
    });

    it('날짜가 아니면 null이다', () => {
      expect(parseShortContentCohortSince('not-a-date')).toBeNull();
    });
  });

  describe('resolveContentLengthProfile', () => {
    it('경계 이후(같은 시각 포함) 가입자는 short다', () => {
      expect(resolveContentLengthProfile(SINCE, SINCE)).toBe(
        ContentLengthProfile.SHORT,
      );
      expect(
        resolveContentLengthProfile(new Date(SINCE.getTime() + 60_000), SINCE),
      ).toBe(ContentLengthProfile.SHORT);
    });

    it('경계 전 가입자는 standard다', () => {
      expect(
        resolveContentLengthProfile(new Date(SINCE.getTime() - 1), SINCE),
      ).toBe(ContentLengthProfile.STANDARD);
    });

    it('설정이 비면 누구든 standard다 — 롤백 스위치', () => {
      expect(resolveContentLengthProfile(SINCE, null)).toBe(
        ContentLengthProfile.STANDARD,
      );
    });

    it('가입 시각을 모르면(옛 토큰) standard다', () => {
      expect(resolveContentLengthProfile(null, SINCE)).toBe(
        ContentLengthProfile.STANDARD,
      );
      expect(resolveContentLengthProfile(undefined, SINCE)).toBe(
        ContentLengthProfile.STANDARD,
      );
    });
  });

  describe('cohortLengthProfileSql', () => {
    it('경계 파라미터가 NULL이면 standard, 가입 시각 >= 경계면 short인 CASE 식이다(실제 DB 동치는 e2e가 본다)', () => {
      expect(cohortLengthProfileSql('u.created_at', '$8')).toBe(
        "(CASE WHEN $8::timestamptz IS NOT NULL AND u.created_at >= $8::timestamptz THEN 'short' ELSE 'standard' END)",
      );
    });
  });
});
