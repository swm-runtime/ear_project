import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { DripGroup } from '@/modules/drip/drip.enum';
import { TargetedPushService } from '@/modules/notification/services/targeted-push.service';
import { UserMarket } from '@/modules/user/user.enum';

import { isMorningPushHoldout } from './morning-push.policy';
import { MorningPushService } from './morning-push.service';
import { RetentionPushMode } from './retention-push.enum';
import {
  MorningFactRow,
  RetentionPushRepository,
} from './retention-push.repository';

/** 2026-10-30(금) 08:00 KST */
const NOW = new Date('2026-10-29T23:00:00.000Z');
const SINGLE_USER = '11111111-1111-4111-8111-111111111111';
const MANY_USER = '22222222-2222-4222-8222-222222222222';
const PLACED_USER = '33333333-3333-4333-8333-333333333333';
const NO_DEVICE_USER = '44444444-4444-4444-8444-444444444444';

const FACTS: Record<string, MorningFactRow> = {
  [SINGLE_USER]: {
    userId: SINGLE_USER,
    unplayedCount: 1,
    single: { contentId: 'c1', title: '연봉 협상의 기술' },
    listenedRecently: false,
  },
  [MANY_USER]: {
    userId: MANY_USER,
    unplayedCount: 5,
    single: null,
    listenedRecently: false,
  },
  [PLACED_USER]: {
    userId: PLACED_USER,
    unplayedCount: 2,
    single: null,
    listenedRecently: false,
  },
};

describe('MorningPushService — 아침 알림(KAN-288)', () => {
  let repository: jest.Mocked<RetentionPushRepository>;
  let targetedPushService: jest.Mocked<TargetedPushService>;
  /** `findSentHistory`가 머리로 걸러 돌려줄 보낸 기록 */
  let sentLogs: { userId: string; type: string; sentAt: Date }[];
  /** `findLoggedUserIds`가 돌려줄 비교 그룹 기록(보내지 않음) */
  let holdoutLogs: { userId: string; type: string; at: Date }[];

  const build = (env: Record<string, string>): MorningPushService =>
    new MorningPushService(repository, targetedPushService, {
      get: (key: string) => env[key],
    } as unknown as ConfigService<EnvironmentVariables, true>);
  const sentPushes = () => targetedPushService.send.mock.calls[0][0];

  beforeEach(() => {
    sentLogs = [];
    holdoutLogs = [];
    repository = {
      // 대상(마케팅 동의 · 온보딩 완료)은 SQL 이 거른다 — e2e 가 본다
      findAudience: jest.fn().mockResolvedValue(
        [SINGLE_USER, MANY_USER, PLACED_USER, NO_DEVICE_USER].map((userId) => ({
          userId,
          market: UserMarket.KR,
          timezone: null,
        })),
      ),
      findMorningFacts: jest
        .fn()
        .mockImplementation(({ userIds }: { userIds: string[] }) =>
          Promise.resolve(
            userIds.flatMap((id) => (FACTS[id] ? [FACTS[id]] : [])),
          ),
        ),
    } as unknown as jest.Mocked<RetentionPushRepository>;
    targetedPushService = {
      filterDeliverableUserIds: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(new Set(ids.filter((id) => id !== NO_DEVICE_USER))),
        ),
      findSentHistory: jest
        .fn()
        .mockImplementation((userIds: string[], prefix: string, since: Date) =>
          Promise.resolve(
            sentLogs.filter(
              (log) =>
                userIds.includes(log.userId) &&
                log.type.startsWith(prefix) &&
                log.sentAt >= since,
            ),
          ),
        ),
      findLoggedUserIds: jest
        .fn()
        .mockImplementation(
          (userIds: string[], type: string, _status: string, since: Date) =>
            Promise.resolve(
              new Set(
                holdoutLogs
                  .filter(
                    (log) =>
                      userIds.includes(log.userId) &&
                      log.type === type &&
                      log.at >= since,
                  )
                  .map((log) => log.userId),
              ),
            ),
        ),
      recordSkipped: jest.fn().mockResolvedValue(undefined),
      send: jest
        .fn()
        .mockImplementation((pushes: unknown[]) =>
          Promise.resolve({ sent: pushes.length, failed: 0, noDevice: 0 }),
        ),
    } as unknown as jest.Mocked<TargetedPushService>;
  });

  it('스위치가 없으면 꺼져 있다 — 저녁(RETENTION_PUSH_MODE)이 켜져 있어도 따로다', () => {
    const service = build({ RETENTION_PUSH_MODE: 'on' });

    expect(service.mode).toBe(RetentionPushMode.OFF);
    expect(service.isGroupActive(DripGroup.ASIA)).toBe(false);
  });

  it('on 이면 오늘 드립이 없는 사용자에게만 1편은 그 콘텐츠로 · 여러 편은 라이브러리로 보낸다', async () => {
    // given
    const service = build({ RETENTION_MORNING_PUSH_MODE: 'on' });

    // when
    const summary = await service.run(
      DripGroup.ASIA,
      NOW,
      new Set([PLACED_USER]),
    );

    // then — 오늘 적립받은 사용자는 도착 알림 몫이라 빠진다. 기기 없는 사용자는 대상에서 빠진다
    const pushes = sentPushes();
    expect(
      Object.fromEntries(pushes.map((push) => [push.userId, push.deepLink])),
    ).toEqual({
      [SINGLE_USER]: 'ear://contents/c1',
      [MANY_USER]: 'ear://library',
    });
    for (const push of pushes) {
      expect(push.type).toMatch(/^retention\.morning\.[ab]$/);
      expect(push.title.startsWith('(광고) ')).toBe(true);
      expect(push.body.endsWith('\n수신거부: 설정 > 알림')).toBe(true);
    }
    expect(summary).toMatchObject({
      audience: 3,
      planned: 2,
      skipped: { placed_today: 1 },
      sent: 2,
    });
  });

  it('비교 그룹이 켜지면 보낼 대상 중 해시 반은 보내지 않고 holdout 으로 기록만 남긴다', async () => {
    // given
    const service = build({
      RETENTION_MORNING_PUSH_MODE: 'on',
      RETENTION_MORNING_HOLDOUT_ENABLED: 'true',
    });
    const planned = [SINGLE_USER, MANY_USER];
    const held = planned.filter((id) => isMorningPushHoldout(id));
    const sent = planned.filter((id) => !isMorningPushHoldout(id));

    // when
    const summary = await service.run(
      DripGroup.ASIA,
      NOW,
      new Set([PLACED_USER]),
    );

    // then
    const sentIds =
      targetedPushService.send.mock.calls.length > 0
        ? sentPushes().map((push) => push.userId)
        : [];
    expect(sentIds.sort()).toEqual([...sent].sort());
    const recorded =
      targetedPushService.recordSkipped.mock.calls.length > 0
        ? targetedPushService.recordSkipped.mock.calls[0][0]
        : [];
    expect(recorded.map((entry) => entry.userId).sort()).toEqual(
      [...held].sort(),
    );
    for (const entry of recorded) {
      expect(entry.type).toBe('retention.morning.holdout');
    }
    expect(summary).toMatchObject({
      planned: 2,
      holdout: held.length,
      sent: sent.length,
    });
  });

  it('비교 그룹 스위치가 없으면 전원에게 보내고 holdout 기록을 남기지 않는다', async () => {
    // given
    const service = build({ RETENTION_MORNING_PUSH_MODE: 'on' });

    // when
    const summary = await service.run(DripGroup.ASIA, NOW, new Set());

    // then
    expect(summary.holdout).toBe(0);
    expect(sentPushes()).toHaveLength(3);
    expect(targetedPushService.recordSkipped).not.toHaveBeenCalled();
  });

  it('dry_run 은 비교 그룹이 켜져 있어도 holdout 기록을 남기지 않는다', async () => {
    // given
    const service = build({
      RETENTION_MORNING_PUSH_MODE: 'dry_run',
      RETENTION_MORNING_HOLDOUT_ENABLED: 'true',
    });

    // when
    const summary = await service.run(DripGroup.ASIA, NOW, new Set());

    // then
    expect(summary.holdout).toBe(0);
    expect(targetedPushService.recordSkipped).not.toHaveBeenCalled();
  });

  it('최근 20시간 안에 holdout 기록이 있으면 다시 정하지 않는다 — 같은 그룹이 두 번 돌아도 하루 1건', async () => {
    // given
    holdoutLogs = [
      {
        userId: SINGLE_USER,
        type: 'retention.morning.holdout',
        at: new Date(NOW.getTime() - 60 * 60 * 1000),
      },
    ];
    const service = build({
      RETENTION_MORNING_PUSH_MODE: 'on',
      RETENTION_MORNING_HOLDOUT_ENABLED: 'true',
    });

    // when
    const summary = await service.run(DripGroup.ASIA, NOW, new Set());

    // then
    expect(summary.skipped.already_sent).toBe(1);
    const touched = [
      ...(targetedPushService.send.mock.calls[0]?.[0] ?? []).map(
        (push) => push.userId,
      ),
      ...(targetedPushService.recordSkipped.mock.calls[0]?.[0] ?? []).map(
        (entry) => entry.userId,
      ),
    ];
    expect(touched).not.toContain(SINGLE_USER);
  });

  it('dry_run 은 정하기만 하고 보내지 않는다 — 시험 대상이 없으면 아무에게도', async () => {
    // given
    const service = build({ RETENTION_MORNING_PUSH_MODE: 'dry_run' });

    // when
    const summary = await service.run(DripGroup.ASIA, NOW, new Set());

    // then
    expect(summary.planned).toBe(3);
    expect(summary.sent).toBe(0);
    expect(targetedPushService.send).not.toHaveBeenCalled();
  });

  it('dry_run 에 시험 대상이 있으면 그 사용자에게만 보낸다(저녁과 같은 RETENTION_PUSH_TEST_USER_IDS)', async () => {
    // given
    const service = build({
      RETENTION_MORNING_PUSH_MODE: 'dry_run',
      RETENTION_PUSH_TEST_USER_IDS: MANY_USER,
    });

    // when
    await service.run(DripGroup.ASIA, NOW, new Set());

    // then
    expect(sentPushes().map((push) => push.userId)).toEqual([MANY_USER]);
  });

  it('하루 1건 — 오늘 도착 알림을 받았거나 최근 20시간 안에 아침 알림을 받았으면 보내지 않는다', async () => {
    // given
    sentLogs = [
      // 오늘(05:00 KST 이후) 드립 도착 알림 — 07:30 A 그룹
      {
        userId: SINGLE_USER,
        type: 'drip_arrival.a',
        sentAt: new Date(NOW.getTime() - 30 * 60_000),
      },
      // 재시작으로 08:00 이 두 번 돈 경우
      {
        userId: MANY_USER,
        type: 'retention.morning.b',
        sentAt: new Date(NOW.getTime() - 60_000),
      },
    ];
    const service = build({ RETENTION_MORNING_PUSH_MODE: 'on' });

    // when
    const summary = await service.run(DripGroup.ASIA, NOW, new Set());

    // then
    expect(sentPushes().map((push) => push.userId)).toEqual([PLACED_USER]);
    expect(summary.skipped).toEqual({ arrival_sent: 1, already_sent: 1 });
  });

  it('저녁 리텐션 알림(어제 18:00)과 주간 건수는 아침 알림을 막지 않는다 — 아침 알림 자체의 주간 상한도 없다', async () => {
    // given — 어제 18:00 저녁 알림 · 지난 6일 아침 알림 6건
    const hoursAgo = (hours: number) =>
      new Date(NOW.getTime() - hours * 60 * 60 * 1000);
    sentLogs = [
      {
        userId: MANY_USER,
        type: 'retention.streak_keep.a',
        sentAt: hoursAgo(14),
      },
      ...[24, 48, 72, 96, 120, 144].map((hours) => ({
        userId: MANY_USER,
        type: 'retention.morning.a',
        sentAt: hoursAgo(hours),
      })),
    ];
    const service = build({ RETENTION_MORNING_PUSH_MODE: 'on' });

    // when
    await service.run(DripGroup.ASIA, NOW, new Set());

    // then
    expect(sentPushes().map((push) => push.userId)).toContain(MANY_USER);
  });

  it('시간대 그룹이 켜져 있으면 그 그룹 사용자만 보고, 현지가 08시 전인 사용자는 건너뛴다', async () => {
    // given — 싱가포르 08:00 에 방콕(07:00) 사용자
    const sg0800 = new Date('2026-10-30T00:00:00.000Z');
    repository.findAudience.mockResolvedValue([
      {
        userId: SINGLE_USER,
        market: UserMarket.GLOBAL,
        timezone: 'Asia/Singapore',
      },
      {
        userId: MANY_USER,
        market: UserMarket.GLOBAL,
        timezone: 'Asia/Bangkok',
      },
      { userId: PLACED_USER, market: UserMarket.KR, timezone: null },
    ]);
    const service = build({
      RETENTION_MORNING_PUSH_MODE: 'on',
      DRIP_TIMEZONE_GROUPS_ENABLED: 'true',
    });

    // when
    const summary = await service.run(
      DripGroup.SOUTHEAST_ASIA,
      sg0800,
      new Set(),
    );

    // then — KR 사용자는 asia 그룹이라 빠지고, 방콕은 야간 금지
    expect(sentPushes().map((push) => push.userId)).toEqual([SINGLE_USER]);
    expect(summary.skipped).toEqual({ ad_hours: 1 });
    expect(sentPushes()[0].title.startsWith('(Ad) ')).toBe(true);
  });
});
