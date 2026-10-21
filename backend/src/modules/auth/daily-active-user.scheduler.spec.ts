import { Logger } from '@nestjs/common';

import { DAILY_ACTIVE_USERS_RECOUNT_DAYS } from './auth.constant';
import { DailyActiveUserRepository } from './daily-active-user.repository';
import {
  DailyActiveUserScheduler,
  kstDateOf,
  recountDates,
} from './daily-active-user.scheduler';

describe('DailyActiveUserScheduler', () => {
  let scheduler: DailyActiveUserScheduler;
  let repository: jest.Mocked<DailyActiveUserRepository>;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    repository = {
      recount: jest.fn().mockResolvedValue(undefined),
      recordActiveDates: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DailyActiveUserRepository>;
    scheduler = new DailyActiveUserScheduler(repository);
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('kstDateOf — UTC 15:00 이후는 KST 로 다음 날이다', () => {
    expect(kstDateOf(new Date('2026-10-17T14:59:59.000Z'))).toBe('2026-10-17');
    expect(kstDateOf(new Date('2026-10-17T15:00:00.000Z'))).toBe('2026-10-18');
  });

  it('00:10 KST 에 돌면 어제·그제(KST)를 다시 세고, 오늘은 세지 않는다', async () => {
    // given — KST 2026-10-18 00:10
    const now = new Date('2026-10-17T15:10:00.000Z');

    // when
    await scheduler.recountRecent(now);

    // then
    expect(DAILY_ACTIVE_USERS_RECOUNT_DAYS).toBe(2);
    expect(repository.recount.mock.calls.map(([date]) => date)).toEqual([
      '2026-10-17',
      '2026-10-16',
    ]);
    // 코호트 리텐션 재료(사람별 접속일)도 같은 날짜로 남긴다
    expect(
      repository.recordActiveDates.mock.calls.map(([date]) => date),
    ).toEqual(['2026-10-17', '2026-10-16']);
  });

  it('같은 시각에 두 번 돌아도 같은 날짜를 같은 순서로 다시 셀 뿐이다 — 재집계라 결과가 같다(멱등)', async () => {
    // given
    const now = new Date('2026-10-17T15:10:00.000Z');

    // when
    await scheduler.recountRecent(now);
    await scheduler.recountRecent(now);

    // then
    const dates = repository.recount.mock.calls.map(([date]) => date);
    expect(dates).toEqual([...recountDates(now, 2), ...recountDates(now, 2)]);
  });

  it('한 날짜가 실패해도 던지지 않고 다음 날짜를 계속 센다', async () => {
    // given
    repository.recount
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(undefined);

    // when
    await expect(
      scheduler.recountRecent(new Date('2026-10-17T15:10:00.000Z')),
    ).resolves.toBeUndefined();

    // then
    expect(repository.recount).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      'daily active users recount failed (2026-10-17)',
      expect.any(String),
    );
  });
});
