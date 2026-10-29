import {
  hasReachedReward,
  isPromotionExpired,
  isRewardEligibleReview,
  resolvePromotionExpiresAt,
  toPromotionLastUsableDate,
  toRewardProgress,
} from './promotion.policy';

describe('promotion.policy', () => {
  // 운영과 같은 05:00 경계(2026-10-12 05:00 KST 전환)로 계산한다
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

  describe('isRewardEligibleReview', () => {
    it('끝까지 들은 편 · 공백을 뺀 글 10자 이상이면 보상으로 친다', () => {
      expect(
        isRewardEligibleReview({
          isCompleted: true,
          text: '가나다라마바사아자차',
        }),
      ).toBe(true);
    });

    it('공백을 빼고 9자면 치지 않는다 — 띄어쓰기 · 전각 공백 · 줄바꿈으로 채운 글', () => {
      expect(
        isRewardEligibleReview({
          isCompleted: true,
          text: '가 나 다　라\n마 바 사 아 자',
        }),
      ).toBe(false);
    });

    it('이모지는 한 글자로 센다', () => {
      expect(
        isRewardEligibleReview({ isCompleted: true, text: '👍'.repeat(10) }),
      ).toBe(true);
      expect(
        isRewardEligibleReview({ isCompleted: true, text: '👍'.repeat(9) }),
      ).toBe(false);
    });

    it('별점만 있는 후기 · 끝까지 듣지 않은 편의 후기는 치지 않는다', () => {
      expect(isRewardEligibleReview({ isCompleted: true, text: null })).toBe(
        false,
      );
      expect(
        isRewardEligibleReview({
          isCompleted: false,
          text: '아주 길고 좋은 후기 글입니다',
        }),
      ).toBe(false);
    });
  });

  describe('toRewardProgress · hasReachedReward', () => {
    it('진행은 required 를 넘지 않게 자른다', () => {
      expect(toRewardProgress(1)).toEqual({ current: 1, required: 3 });
      expect(toRewardProgress(5)).toEqual({ current: 3, required: 3 });
    });

    it('3편째에서 발급한다', () => {
      expect(hasReachedReward(2)).toBe(false);
      expect(hasReachedReward(3)).toBe(true);
    });
  });

  describe('resolvePromotionExpiresAt', () => {
    it('10-28 발급 → 2027-01-28 05:00 KST 소멸, 마지막 사용일 01-27', () => {
      // 2026-10-28 12:00 KST
      const expiresAt = resolvePromotionExpiresAt(
        new Date('2026-10-28T03:00:00.000Z'),
      );

      expect(expiresAt).toEqual(new Date('2027-01-27T20:00:00.000Z'));
      expect(toPromotionLastUsableDate(expiresAt)).toBe('2027-01-27');
    });

    it('그 달에 같은 날짜가 없으면 말일 — 11-30 → 2027-02-28', () => {
      expect(
        resolvePromotionExpiresAt(new Date('2026-11-30T03:00:00.000Z')),
      ).toEqual(new Date('2027-02-27T20:00:00.000Z'));
    });

    it('기준은 발급 시각의 서비스 날짜다 — 10-29 04:30 KST 는 10-28 발급', () => {
      expect(
        resolvePromotionExpiresAt(new Date('2026-10-28T19:30:00.000Z')),
      ).toEqual(new Date('2027-01-27T20:00:00.000Z'));
    });
  });

  describe('isPromotionExpired', () => {
    it('소멸 시각은 배타 경계 — 그 순간부터 소멸', () => {
      const expiresAt = new Date('2027-01-27T20:00:00.000Z');

      expect(
        isPromotionExpired(expiresAt, new Date('2027-01-27T19:59:59.999Z')),
      ).toBe(false);
      expect(isPromotionExpired(expiresAt, expiresAt)).toBe(true);
    });
  });
});
