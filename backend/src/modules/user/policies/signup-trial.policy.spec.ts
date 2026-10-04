import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { resolveExistingUserTrialEndsAtFor } from './signup-trial.policy';

type TrialEnv = Partial<
  Record<
    | 'SIGNUP_TRIAL_ENABLED'
    | 'SIGNUP_TRIAL_DAYS'
    | 'SIGNUP_TRIAL_EXISTING_USERS_BEFORE',
    string
  >
>;

function buildConfigService(
  env: TrialEnv,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: keyof TrialEnv) => env[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

// 10월 12일 18:00 KST에 앱을 열었다
const NOW = new Date('2026-10-12T09:00:00.000Z');
const ON: TrialEnv = {
  SIGNUP_TRIAL_ENABLED: 'true',
  SIGNUP_TRIAL_EXISTING_USERS_BEFORE: '2026-10-11',
};
// 9월 20일 가입 — 체험 도입 전
const JOINED_BEFORE = new Date('2026-09-20T03:00:00.000Z');

describe('resolveExistingUserTrialEndsAtFor — 체험 도입 전 가입자(subscription.md 4.8)', () => {
  it('경계 날짜보다 먼저 가입했고 체험을 받은 적 없으면 앱을 연 날부터 7일을 준다', () => {
    // when
    const endsAt = resolveExistingUserTrialEndsAtFor(
      buildConfigService(ON),
      { trialEndsAt: null, createdAt: JOINED_BEFORE },
      NOW,
    );

    // then — 가입일(9월 20일)이 아니라 연 날(10월 12일)이 1일째: 10월 12~18일, 19일 04:00 KST 종료
    expect(endsAt?.toISOString()).toBe('2026-10-18T19:00:00.000Z');
  });

  it('체험을 받은 적 있으면 다시 주지 않는다 — 이미 끝난 체험도 받은 것이다', () => {
    const endsAt = resolveExistingUserTrialEndsAtFor(
      buildConfigService(ON),
      {
        trialEndsAt: new Date('2026-10-01T19:00:00.000Z'),
        createdAt: JOINED_BEFORE,
      },
      NOW,
    );

    expect(endsAt).toBeNull();
  });

  it('경계 날짜 이후에 가입한 계정은 대상이 아니다 — 스위치가 꺼진 사이의 가입자가 쓸려 들어가지 않는다', () => {
    // given — 경계 당일(10월 11일 10:00 KST)에 가입
    const joinedOnBoundary = new Date('2026-10-11T01:00:00.000Z');

    // when
    const endsAt = resolveExistingUserTrialEndsAtFor(
      buildConfigService(ON),
      { trialEndsAt: null, createdAt: joinedOnBoundary },
      NOW,
    );

    // then
    expect(endsAt).toBeNull();
  });

  it('경계는 달력 날짜가 아니라 서비스 날짜(04:00 KST)로 본다', () => {
    // given — 10월 11일 02:00 KST 가입은 서비스 날짜로 10월 10일이다
    const joinedBeforeDawn = new Date('2026-10-10T17:00:00.000Z');

    // when
    const endsAt = resolveExistingUserTrialEndsAtFor(
      buildConfigService(ON),
      { trialEndsAt: null, createdAt: joinedBeforeDawn },
      NOW,
    );

    // then
    expect(endsAt).not.toBeNull();
  });

  it('경계 날짜가 없으면 기존 가입자에게 주지 않는다 — 기본은 꺼짐', () => {
    for (const before of [undefined, '']) {
      const endsAt = resolveExistingUserTrialEndsAtFor(
        buildConfigService({
          SIGNUP_TRIAL_ENABLED: 'true',
          SIGNUP_TRIAL_EXISTING_USERS_BEFORE: before,
        }),
        { trialEndsAt: null, createdAt: JOINED_BEFORE },
        NOW,
      );

      expect(endsAt).toBeNull();
    }
  });

  it('가입 체험 스위치가 꺼져 있으면 경계 날짜가 있어도 주지 않는다 — 스위치 하나로 전부 멈춘다', () => {
    const endsAt = resolveExistingUserTrialEndsAtFor(
      buildConfigService({ ...ON, SIGNUP_TRIAL_ENABLED: 'false' }),
      { trialEndsAt: null, createdAt: JOINED_BEFORE },
      NOW,
    );

    expect(endsAt).toBeNull();
  });

  it('일수 설정을 가입 체험과 같이 따른다', () => {
    const endsAt = resolveExistingUserTrialEndsAtFor(
      buildConfigService({ ...ON, SIGNUP_TRIAL_DAYS: '3' }),
      { trialEndsAt: null, createdAt: JOINED_BEFORE },
      NOW,
    );

    // 10월 12~14일, 15일 04:00 KST 종료
    expect(endsAt?.toISOString()).toBe('2026-10-14T19:00:00.000Z');
  });
});
