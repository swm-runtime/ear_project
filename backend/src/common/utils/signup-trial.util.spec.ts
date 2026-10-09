import {
  isSignupTrialActive,
  resolveSignupTrialEndsAt,
  toSignupTrialLastFreeDate,
} from './signup-trial.util';

describe('signup-trial.util', () => {
  describe('resolveSignupTrialEndsAt', () => {
    it('가입한 서비스 날짜를 1일째로 세어 7일째가 끝나는 04:00 KST에 끝난다', () => {
      // given — 10월 3일 15:00 KST 가입
      const signedUpAt = new Date('2026-10-03T06:00:00.000Z');

      // when
      const endsAt = resolveSignupTrialEndsAt(signedUpAt, 7);

      // then — 10월 10일 04:00 KST
      expect(endsAt.toISOString()).toBe('2026-10-09T19:00:00.000Z');
    });

    it('새벽 4시 전에 가입하면 전날 서비스 날짜가 1일째다', () => {
      // given — 10월 4일 03:59 KST 가입(서비스 날짜는 10월 3일)
      const signedUpAt = new Date('2026-10-03T18:59:00.000Z');

      // when
      const endsAt = resolveSignupTrialEndsAt(signedUpAt, 7);

      // then — 10월 3일 15시 가입자와 같은 시각에 끝난다
      expect(endsAt.toISOString()).toBe('2026-10-09T19:00:00.000Z');
    });

    it('새벽 4시 정각 가입은 그날이 1일째다', () => {
      // given — 10월 4일 04:00 KST
      const signedUpAt = new Date('2026-10-03T19:00:00.000Z');

      // when
      const endsAt = resolveSignupTrialEndsAt(signedUpAt, 7);

      // then — 10월 11일 04:00 KST
      expect(endsAt.toISOString()).toBe('2026-10-10T19:00:00.000Z');
    });

    it('경계가 05:00 으로 전환된 뒤 가입하면 종료도 05:00 경계다(KAN-149)', () => {
      const key = 'SERVICE_DAY_BOUNDARY_05_FROM';
      const original = process.env[key];
      process.env[key] = '2026-10-14T05:00:00+09:00';
      try {
        // 10월 20일 15:00 KST 가입 → 10월 20~26일 체험, 10월 27일 05:00 KST 종료
        const endsAt = resolveSignupTrialEndsAt(
          new Date('2026-10-20T06:00:00.000Z'),
          7,
        );
        expect(endsAt.toISOString()).toBe('2026-10-26T20:00:00.000Z');
        expect(toSignupTrialLastFreeDate(endsAt)).toBe('2026-10-26');
      } finally {
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
      }
    });

    it('경계 전환일(04:00 시작 → 다음 날 05:00, 25시간)에 받은 체험도 마지막 날의 05:00 경계에 끝난다', () => {
      const key = 'SERVICE_DAY_BOUNDARY_05_FROM';
      const original = process.env[key];
      process.env[key] = '2026-10-12T05:00:00+09:00';
      try {
        // 전환일 10월 12일 15:00 KST 가입 → 10월 12~18일 체험, 10월 19일 05:00 KST 종료.
        // 시작(10/12 04:00) + 7×24h 로 더하면 10/19 04:00 이 되어 그날 경계(05:00)까지 한 시간이 한도에 잡힌다
        const endsAt = resolveSignupTrialEndsAt(
          new Date('2026-10-12T06:00:00.000Z'),
          7,
        );
        expect(endsAt.toISOString()).toBe('2026-10-18T20:00:00.000Z');
        expect(toSignupTrialLastFreeDate(endsAt)).toBe('2026-10-18');
        expect(
          isSignupTrialActive(endsAt, new Date('2026-10-18T19:30:00.000Z')),
        ).toBe(true);
      } finally {
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
      }
    });

    it('일수를 바꾸면 그만큼의 서비스 날짜를 준다', () => {
      const signedUpAt = new Date('2026-10-03T06:00:00.000Z');

      expect(resolveSignupTrialEndsAt(signedUpAt, 1).toISOString()).toBe(
        '2026-10-03T19:00:00.000Z',
      );
    });
  });

  describe('isSignupTrialActive', () => {
    const endsAt = new Date('2026-10-09T19:00:00.000Z');

    it('종료 시각 전이면 체험 중이다', () => {
      expect(
        isSignupTrialActive(endsAt, new Date('2026-10-09T18:59:59.999Z')),
      ).toBe(true);
    });

    it('종료 시각 정각부터는 체험이 아니다 — 그 서비스 날짜부터 한도를 센다', () => {
      expect(isSignupTrialActive(endsAt, endsAt)).toBe(false);
    });

    it('값이 빠진 사용자 객체가 들어와도 죽지 않고 체험이 아닌 쪽으로 판정한다', () => {
      expect(
        isSignupTrialActive(undefined, new Date('2026-10-03T06:00:00.000Z')),
      ).toBe(false);
    });

    it('체험을 받지 않은 계정은 체험이 아니다', () => {
      expect(
        isSignupTrialActive(null, new Date('2026-10-03T06:00:00.000Z')),
      ).toBe(false);
    });
  });

  describe('toSignupTrialLastFreeDate', () => {
    it('종료 시각의 전 서비스 날짜를 라벨로 돌려준다', () => {
      // given — 10월 10일 04:00 KST 종료
      const endsAt = new Date('2026-10-09T19:00:00.000Z');

      // then — 마지막으로 무제한인 날은 10월 9일
      expect(toSignupTrialLastFreeDate(endsAt)).toBe('2026-10-09');
    });
  });
});
