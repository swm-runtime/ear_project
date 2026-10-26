import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { DripGroup } from '@/modules/drip/drip.enum';
import { DripBatchRunService } from '@/modules/drip/services/drip-batch-run.service';

/**
 * 드립 실행 기록의 그룹 축(KAN-191, `global-api.md` 2.4) — 선점·재개·조회 SQL 이 실제 DB 에서 `(run_date, group)`
 * 유니크로 동작하는지 본다. `group`은 SQL 예약어라 따옴표가 빠지면 여기서 깨진다.
 * 날짜는 다른 테스트와 겹치지 않는 먼 날(2030-02-20)을 쓰고, 심은 행은 끝나면 지운다.
 */
describe('드립 실행 기록 그룹 축 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let service: DripBatchRunService;

  const RUN_DATE = '2030-02-20';
  const STARTED_AT = new Date('2030-02-19T20:00:00.000Z');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    service = app.get(DripBatchRunService);
    await deleteRuns();
  }, 60_000);

  afterAll(async () => {
    await deleteRuns();
    await app.close();
  }, 60_000);

  it('같은 서비스 날짜에 그룹마다 한 번씩 선점되고, 같은 그룹은 두 번 선점되지 않는다', async () => {
    // when
    const claimed = await Promise.all(
      Object.values(DripGroup).map((group) =>
        service.claim(RUN_DATE, group, STARTED_AT),
      ),
    );
    const again = await service.claim(RUN_DATE, DripGroup.EUROPE, STARTED_AT);

    // then
    expect(claimed.map((run) => run?.group)).toEqual(Object.values(DripGroup));
    // 도착 알림이 `created_at`부터 적립분을 읽는다 — DB now() 가 아니라 선점 시각이어야 첫 패스가 빠지지 않는다
    expect(claimed.map((run) => run?.createdAt)).toEqual(
      Object.values(DripGroup).map(() => STARTED_AT),
    );
    expect(again).toBeNull();
    const rows = await dataSource.query<{ group: string }[]>(
      `SELECT "group" FROM drip_batch_runs WHERE run_date = $1 ORDER BY "group"`,
      [RUN_DATE],
    );
    expect(rows.map((row) => row.group)).toEqual([
      'americas',
      'asia',
      'europe',
      // varchar(16) 에 14자 — 마이그레이션 없이 들어간다(2026-10-26)
      'southeast_asia',
    ]);
  });

  it('재개와 조회는 그 그룹 행만 건드린다', async () => {
    // given — europe 만 끝났다
    const europe = await service.findByRunDateAndGroup(
      RUN_DATE,
      DripGroup.EUROPE,
    );
    await service.finish(
      europe!,
      {
        targetCount: 1,
        successCount: 1,
        skippedCount: 0,
        exhaustedCount: 0,
        failedCount: 0,
      },
      STARTED_AT,
    );

    // when
    const resumedEurope = await service.claim(
      RUN_DATE,
      DripGroup.EUROPE,
      STARTED_AT,
      { reclaimUnfinished: true },
    );
    const resumedAmericas = await service.claim(
      RUN_DATE,
      DripGroup.AMERICAS,
      STARTED_AT,
      { reclaimUnfinished: true },
    );

    // then
    expect(resumedEurope).toBeNull();
    expect(resumedAmericas?.group).toBe(DripGroup.AMERICAS);
    expect(
      (await service.findByRunDateAndGroup(RUN_DATE, DripGroup.ASIA))
        ?.finishedAt,
    ).toBeNull();
  });

  async function deleteRuns(): Promise<void> {
    await dataSource.query(`DELETE FROM drip_batch_runs WHERE run_date = $1`, [
      RUN_DATE,
    ]);
  }
});
