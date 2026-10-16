import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `play_daily_totals` (domain.md 6.3-1, 2026-10-17).
 *
 * 서비스 지표의 누적 청취 시간·재생 수가 `play_records` 합계라 **탈퇴가 생기면 줄었다**(2026-10-16 운영 100시간 → 96시간).
 * 누적 완청 수(`user_signals`)는 탈퇴에 더해 180일 보존 배치로도 줄어든다.
 * 재생 기록을 쓸 때 서비스 날짜별 누적에도 함께 더하고, 지표는 이 표를 읽는다. 사용자를 가리키지 않는 집계라 탈퇴해도 남는다.
 *
 * 지금 남아 있는 재생 기록으로 채운다. **이미 탈퇴한 사람의 몫은 기록이 지워져 되살리지 못한다** — 이 시점부터 줄지 않는다.
 */
export class AddPlayDailyTotals1790500000000 implements MigrationInterface {
  name = 'AddPlayDailyTotals1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "play_daily_totals" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "play_date" date NOT NULL,
         "play_count" integer NOT NULL DEFAULT '0',
         "listen_sec" bigint NOT NULL DEFAULT '0',
         "complete_count" integer NOT NULL DEFAULT '0',
         CONSTRAINT "PK_play_daily_totals_play_date" PRIMARY KEY ("play_date")
       )`,
    );
    await queryRunner.query(
      `INSERT INTO "play_daily_totals" ("play_date", "play_count", "listen_sec")
       SELECT "play_date", count(*), COALESCE(sum("listened_sec"), 0)
         FROM "play_records"
        GROUP BY "play_date"`,
    );
    // 완청 신호의 서비스 날짜 — 05:00 KST 경계(domain.md 1.2)로 맞춘다. 경계가 04:00 이던 2026-10-12 전 신호 중 04~05시 것은
    // 하루 앞 날짜로 들어가지만, 지표는 합계만 읽어 값이 같다
    await queryRunner.query(
      `INSERT INTO "play_daily_totals" ("play_date", "complete_count")
       SELECT ((created_at AT TIME ZONE 'Asia/Seoul') - interval '5 hours')::date, count(*)
         FROM "user_signals"
        WHERE "action" = 'complete'
        GROUP BY 1
       ON CONFLICT ("play_date") DO UPDATE SET "complete_count" = EXCLUDED."complete_count"`,
    );
  }

  /** 되돌리면 탈퇴자 몫이 사라진다 — 원천(`play_records`)에서 다시 만들 수 없는 값이라 되돌리기 전에 덤프해 둔다 */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "play_daily_totals"`);
  }
}
