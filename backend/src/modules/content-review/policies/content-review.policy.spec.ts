import { ContentReviewUnreviewableReason } from '../content-review.enum';
import {
  codePointLength,
  nextLastPromptedDate,
  normalizeReviewText,
  promptCompletedSince,
  resolveMutedUntil,
  resolvePromptGate,
  resolveUnreviewableReason,
} from './content-review.policy';

describe('content-review.policy', () => {
  // 운영과 같은 05:00 경계(2026-10-12 05:00 KST 전환)로 계산한다 — 비워 두면 04:00 경계다
  const switchKey = 'SERVICE_DAY_BOUNDARY_05_FROM';
  const previousSwitch = process.env[switchKey];
  beforeAll(() => {
    process.env[switchKey] = '2026-10-12T05:00:00+09:00';
  });
  afterAll(() => {
    if (previousSwitch === undefined) {
      delete process.env[switchKey];
    } else {
      process.env[switchKey] = previousSwitch;
    }
  });

  describe('normalizeReviewText', () => {
    it('앞뒤 공백을 뺀다 — 가운데 공백 · 줄바꿈은 그대로다', () => {
      expect(normalizeReviewText('  비유가 쉬워요\n좋아요 \t')).toBe(
        '비유가 쉬워요\n좋아요',
      );
    });

    it.each([[''], ['   '], ['\n\t 　']])(
      '공백뿐인 글(%j)은 글 없음(null)이다 — 빈 문자열을 저장하지 않는다',
      (raw) => {
        expect(normalizeReviewText(raw)).toBeNull();
      },
    );

    it('null · 생략은 글 없음이다(있던 글을 지운다)', () => {
      expect(normalizeReviewText(null)).toBeNull();
      expect(normalizeReviewText(undefined)).toBeNull();
    });
  });

  describe('codePointLength', () => {
    it('이모지 하나를 1자로 센다 — UTF-16 길이(2)가 아니다', () => {
      expect('👍'.length).toBe(2);
      expect(codePointLength('👍')).toBe(1);
      expect(codePointLength('좋아요👍')).toBe(4);
    });
  });

  describe('resolveUnreviewableReason', () => {
    it('모두 만족하면 사유가 없다', () => {
      expect(
        resolveUnreviewableReason({
          enabled: true,
          visible: true,
          played: true,
        }),
      ).toBeNull();
    });

    it('판정 순서는 스위치 → 회수 → 재생 시작이다(4.1 · 4.2 에러 순서)', () => {
      expect(
        resolveUnreviewableReason({
          enabled: false,
          visible: false,
          played: false,
        }),
      ).toBe(ContentReviewUnreviewableReason.DISABLED);
      expect(
        resolveUnreviewableReason({
          enabled: true,
          visible: false,
          played: false,
        }),
      ).toBe(ContentReviewUnreviewableReason.WITHDRAWN);
      expect(
        resolveUnreviewableReason({
          enabled: true,
          visible: true,
          played: false,
        }),
      ).toBe(ContentReviewUnreviewableReason.NOT_PLAYED);
    });
  });

  describe('resolvePromptGate', () => {
    it('물은 적 없고 그만 보기도 없으면 열린다', () => {
      expect(
        resolvePromptGate({
          today: '2026-10-29',
          mutedUntil: null,
          lastPromptedDate: null,
        }),
      ).toEqual({ open: true });
    });

    it('10-28에 물었으면 10-29(다음 날)는 닫히고 10-30(2일째)부터 열린다', () => {
      const at = (today: string) =>
        resolvePromptGate({
          today,
          mutedUntil: null,
          lastPromptedDate: '2026-10-28',
        });

      expect(at('2026-10-28')).toEqual({ open: false, mutedUntil: null });
      expect(at('2026-10-29')).toEqual({ open: false, mutedUntil: null });
      expect(at('2026-10-30')).toEqual({ open: true });
    });

    it('그만 보기 중이면(오늘 < 종료 라벨) 닫히고 종료 라벨을 돌려준다 — 종료 날짜부터 다시 연다', () => {
      expect(
        resolvePromptGate({
          today: '2026-11-01',
          mutedUntil: '2026-11-02',
          lastPromptedDate: null,
        }),
      ).toEqual({ open: false, mutedUntil: '2026-11-02' });
      expect(
        resolvePromptGate({
          today: '2026-11-02',
          mutedUntil: '2026-11-02',
          lastPromptedDate: null,
        }),
      ).toEqual({ open: true });
    });

    it('그만 보기가 끝나도 2일 간격이 남아 있으면 닫힌다', () => {
      expect(
        resolvePromptGate({
          today: '2026-11-02',
          mutedUntil: '2026-11-02',
          lastPromptedDate: '2026-11-01',
        }),
      ).toEqual({ open: false, mutedUntil: null });
    });
  });

  describe('promptCompletedSince', () => {
    it('오늘을 포함한 14 서비스 날짜의 첫날 05:00 KST 다', () => {
      // 2026-10-29(목) 12:00 KST → 첫날 10-16 05:00 KST = 10-15 20:00Z
      expect(
        promptCompletedSince(new Date('2026-10-29T03:00:00.000Z')),
      ).toEqual(new Date('2026-10-15T20:00:00.000Z'));
    });

    it('05:00 전(04:30 KST)은 전날 서비스 날짜 기준이다', () => {
      // 2026-10-29 04:30 KST = 서비스 날짜 10-28 → 첫날 10-15 05:00 KST
      expect(
        promptCompletedSince(new Date('2026-10-28T19:30:00.000Z')),
      ).toEqual(new Date('2026-10-14T20:00:00.000Z'));
    });
  });

  describe('nextLastPromptedDate', () => {
    it('처음이면 오늘을 적는다', () => {
      expect(nextLastPromptedDate(null, '2026-10-29')).toBe('2026-10-29');
    });

    it('뒤로 가지 않는다 — 같은 날 · 더 늦은 날이 이미 있으면 바꾸지 않는다', () => {
      expect(nextLastPromptedDate('2026-10-29', '2026-10-29')).toBeNull();
      expect(nextLastPromptedDate('2026-10-30', '2026-10-29')).toBeNull();
      expect(nextLastPromptedDate('2026-10-20', '2026-10-29')).toBe(
        '2026-10-29',
      );
    });
  });

  describe('resolveMutedUntil', () => {
    it('다음 서비스 주 월요일 라벨이다', () => {
      // 2026-10-29(목) → 11-02(월)
      expect(resolveMutedUntil(new Date('2026-10-29T03:00:00.000Z'))).toBe(
        '2026-11-02',
      );
    });

    it('월요일 04:30 KST 는 아직 지난주라 그 월요일이 종료다', () => {
      // 2026-11-02(월) 04:30 KST = 서비스 날짜 11-01(일)
      expect(resolveMutedUntil(new Date('2026-11-01T19:30:00.000Z'))).toBe(
        '2026-11-02',
      );
    });
  });
});
