import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { DripGroup } from '@/modules/drip/drip.enum';
import { TargetedPushService } from '@/modules/notification/services/targeted-push.service';
import { UserMarket } from '@/modules/user/user.enum';

import { RetentionPushMode, RetentionRuleKey } from './retention-push.enum';
import {
  RetentionPushRepository,
  RetentionUserFactRow,
} from './retention-push.repository';
import {
  countStreak,
  RetentionPushService,
  sampleCopies,
} from './retention-push.service';

// 2026-10-27(화) 18:00 KST
const NOW = new Date('2026-10-27T09:00:00.000Z');
const KR_USER = '11111111-1111-4111-8111-111111111111';
const GLOBAL_USER = '22222222-2222-4222-8222-222222222222';
const NO_DEVICE_USER = '33333333-3333-4333-8333-333333333333';

function facts(
  userId: string,
  overrides: Partial<RetentionUserFactRow> = {},
): RetentionUserFactRow {
  return {
    userId,
    listenedRecently: false,
    weekListenedSec: 0,
    // 월요일(어제)·일요일 — 2일 연속
    recentPlayDates: ['2026-10-26', '2026-10-25'],
    resume: null,
    ...overrides,
  };
}

describe('RetentionPushService', () => {
  let repository: jest.Mocked<RetentionPushRepository>;
  let targetedPushService: jest.Mocked<TargetedPushService>;

  const build = (env: Record<string, string>): RetentionPushService =>
    new RetentionPushService(repository, targetedPushService, {
      get: (key: string) => env[key],
    } as unknown as ConfigService<EnvironmentVariables, true>);

  beforeEach(() => {
    repository = {
      findAudience: jest.fn().mockResolvedValue([
        { userId: KR_USER, market: UserMarket.KR, timezone: null },
        {
          userId: GLOBAL_USER,
          market: UserMarket.GLOBAL,
          timezone: 'America/Chicago',
        },
        { userId: NO_DEVICE_USER, market: UserMarket.KR, timezone: null },
      ]),
      findUserFacts: jest
        .fn()
        .mockImplementation(({ userIds }: { userIds: string[] }) =>
          Promise.resolve(userIds.map((id) => facts(id))),
        ),
      findMarketFacts: jest.fn().mockResolvedValue({
        population: 100,
        weekListenedDesc: [],
        listenersNow: 0,
      }),
    } as unknown as jest.Mocked<RetentionPushRepository>;

    targetedPushService = {
      filterDeliverableUserIds: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(new Set(ids.filter((id) => id !== NO_DEVICE_USER))),
        ),
      findSentHistory: jest.fn().mockResolvedValue([]),
      send: jest.fn().mockResolvedValue({ sent: 1, failed: 0, noDevice: 0 }),
    } as unknown as jest.Mocked<TargetedPushService>;
  });

  it('스위치가 없으면 꺼져 있다 — 어느 그룹도 돌지 않는다', () => {
    const service = build({});

    expect(service.currentMode).toBe(RetentionPushMode.OFF);
    expect(service.isGroupActive(DripGroup.ASIA)).toBe(false);
  });

  it('dry_run 은 알림을 정하지만 보내지 않는다', async () => {
    // given
    const service = build({ RETENTION_PUSH_MODE: 'dry_run' });

    // when
    const summary = await service.run(DripGroup.ASIA, NOW);

    // then — 시간대 그룹이 꺼져 있으면 asia 가 전원을 맡는다. 기기 없는 사용자는 빠진다
    expect(summary.audience).toBe(2);
    expect(summary.byRule).toEqual({ [RetentionRuleKey.STREAK_KEEP]: 2 });
    expect(targetedPushService.send).not.toHaveBeenCalled();
  });

  it('on 이면 retention.<규칙>.<변형> 종류로 보낸다', async () => {
    // given
    const service = build({ RETENTION_PUSH_MODE: 'on' });

    // when
    await service.run(DripGroup.ASIA, NOW);

    // then
    const pushes = targetedPushService.send.mock.calls[0][0];
    expect(pushes.map((push) => push.userId).sort()).toEqual(
      [KR_USER, GLOBAL_USER].sort(),
    );
    expect(pushes[0].type).toMatch(/^retention\.streak_keep\.[ab]$/);
    expect(pushes.find((push) => push.userId === GLOBAL_USER)?.title).toBe(
      "(Ad) You've listened 2 days in a row",
    );
  });

  it('dry_run 에 시험 대상이 있으면 그 사용자에게만 실제로 보낸다', async () => {
    // given — 대문자·공백·형식이 틀린 값이 섞여도 uuid 만 쓴다
    const service = build({
      RETENTION_PUSH_MODE: 'dry_run',
      RETENTION_PUSH_TEST_USER_IDS: ` ${GLOBAL_USER.toUpperCase()} , not-a-uuid,`,
    });

    // when
    const summary = await service.run(DripGroup.ASIA, NOW);

    // then — 판정은 전원(2명)이지만 보내는 것은 시험 대상 1명
    expect(summary.planned).toBe(2);
    const pushes = targetedPushService.send.mock.calls[0][0];
    expect(pushes.map((push) => push.userId)).toEqual([GLOBAL_USER]);
    expect(pushes[0].title).toBe("(Ad) You've listened 2 days in a row");
  });

  it('시험 대상이라도 규칙이 성립하지 않거나 기기가 없으면 보내지 않는다', async () => {
    // given — 기기 없는 사용자를 시험 대상으로
    const service = build({
      RETENTION_PUSH_MODE: 'dry_run',
      RETENTION_PUSH_TEST_USER_IDS: NO_DEVICE_USER,
    });

    // when
    await service.run(DripGroup.ASIA, NOW);

    // then
    expect(targetedPushService.send).not.toHaveBeenCalled();
  });

  it('off 에서는 시험 대상이 있어도 돌지 않는다', () => {
    const service = build({
      RETENTION_PUSH_MODE: 'off',
      RETENTION_PUSH_TEST_USER_IDS: KR_USER,
    });

    expect(service.isGroupActive(DripGroup.ASIA)).toBe(false);
  });

  it('시간대 그룹이 켜져 있으면 그 그룹의 사용자만 본다', async () => {
    // given
    const service = build({
      RETENTION_PUSH_MODE: 'dry_run',
      DRIP_TIMEZONE_GROUPS_ENABLED: 'true',
    });

    // when
    const plans = await service.planGroup(DripGroup.AMERICAS, NOW);

    // then
    expect(plans.items.map((plan) => plan.userId)).toEqual([GLOBAL_USER]);
  });

  it('최근 20시간 안에 리텐션 알림을 받은 사용자에게는 보내지 않는다', async () => {
    // given
    targetedPushService.findSentHistory.mockResolvedValue([
      {
        userId: KR_USER,
        type: 'retention.peers_listening.a',
        sentAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
      },
    ]);
    const service = build({ RETENTION_PUSH_MODE: 'dry_run' });

    // when
    const plans = await service.planGroup(DripGroup.ASIA, NOW);

    // then
    expect(plans.items.map((plan) => plan.userId)).toEqual([GLOBAL_USER]);
  });
});

describe('countStreak', () => {
  it('어제부터 거꾸로 이어진 날만 센다 — 오늘은 세지 않고, 하루 빠지면 멈춘다', () => {
    expect(
      countStreak(
        ['2026-10-27', '2026-10-26', '2026-10-25', '2026-10-23'],
        '2026-10-27',
      ),
    ).toBe(2);
    expect(countStreak(['2026-10-25'], '2026-10-27')).toBe(0);
  });
});

describe('sampleCopies', () => {
  it('규칙마다 문구 예시 1개만 싣고 사용자 id 는 싣지 않는다', () => {
    const plan = {
      userId: KR_USER,
      ruleKey: RetentionRuleKey.STREAK_KEEP,
      variant: 0,
      title: '(광고) 2일 연속으로 듣고 있어요',
      body: '오늘도 이어 가면 3일째예요\n수신거부: 설정 > 알림',
      deepLink: 'ear://library',
    };

    const samples = sampleCopies([plan, { ...plan, userId: GLOBAL_USER }]);

    expect(samples).toEqual({
      [RetentionRuleKey.STREAK_KEEP]: [
        '(광고) 2일 연속으로 듣고 있어요 / 오늘도 이어 가면 3일째예요 / 수신거부: 설정 > 알림',
      ],
    });
    expect(JSON.stringify(samples)).not.toContain(KR_USER);
  });
});
