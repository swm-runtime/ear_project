import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { DAILY_ACTIVE_USERS_RECOUNT_DAYS } from './auth.constant';
import { DailyActiveUserRepository } from './daily-active-user.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `YYYY-MM-DD` KST 달력일 — KST 는 고정 +9 라 오프셋을 더해 UTC 날짜로 읽으면 된다 */
export function kstDateOf(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `now` 기준 어제부터 `count`일 전까지(최근 날짜 먼저) — 오늘은 아직 끝나지 않아 넣지 않는다 */
export function recountDates(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    kstDateOf(new Date(now.getTime() - (i + 1) * DAY_MS)),
  );
}

/**
 * 일별 접속자 저장 배치(`daily_active_users`) — **매일 00:10 KST**, 어제와 그제를 다시 센다.
 *
 * 세션 행은 만료·폐기 30일 뒤 지워져(`SessionPurgeScheduler`) 지난날을 나중에 셀 수 없다 — 그래서 날이 끝나면 바로 센다.
 * 그제까지 다시 세는 것은 자정을 걸친 늦은 쓰기와, 배포·장애로 하루 크론을 놓친 경우를 메우기 위해서다. 다시 세도 결과가 같다
 * (Repository 가 큰 값을 남긴다 — 멱등).
 *
 * `ScheduleModule`은 스케줄러 프로세스에만 올라가므로(`app.module.ts` · `isSchedulerProcess`) 클러스터(워커 2개)에서도 한 번만 돈다.
 * 겹쳐 돌아도 같은 행을 같은 값으로 upsert 할 뿐이라 잠금을 두지 않는다. 날짜마다 따로 잡고, 실패해도 던지지 않는다 —
 * 던지면 스케줄러가 멈추고, 다음 날 크론이 그제 몫으로 다시 센다.
 */
@Injectable()
export class DailyActiveUserScheduler {
  private readonly logger = new Logger(DailyActiveUserScheduler.name);

  constructor(private readonly repository: DailyActiveUserRepository) {}

  @Cron('10 0 * * *', { name: 'daily-active-users', timeZone: 'Asia/Seoul' })
  async run(): Promise<void> {
    await this.recountRecent(new Date());
  }

  /** 테스트가 시각을 넘긴다 */
  async recountRecent(now: Date): Promise<void> {
    for (const date of recountDates(now, DAILY_ACTIVE_USERS_RECOUNT_DAYS)) {
      try {
        await this.repository.recount(date);
        this.logger.log('daily active users recounted', { date });
      } catch (error) {
        this.logger.error(
          `daily active users recount failed (${date})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
