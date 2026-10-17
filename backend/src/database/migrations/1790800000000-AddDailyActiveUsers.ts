import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `daily_active_users` (domain.md 3.3-1 신설 요청 — `changes/pending/insights-daily-active-users.md`, 2026-10-18).
 *
 * 서비스 지표의 일별 접속자 수. 원천인 `sessions` 행이 만료·폐기 30일 뒤 지워져(domain.md 12.1) 지난날을 다시 셀 수 없으므로,
 * 매일 세어(`DailyActiveUserScheduler`, 00:10 KST) 이 표에 쌓는다.
 *
 * **백필은 지금 남아 있는 세션으로 채울 수 있는 날만이다 — 첫 신뢰 날짜 = 마이그레이션 실행일(KST) - 29일.**
 * 파기는 "만료·폐기 시각이 지금 - 30일보다 이른 행"이라, 지금 - 30일 이후에 발급된 세션은 모두 남아 있다. 그 시각이 걸친 날
 * (실행일 - 30일)은 이미 일부가 지워진 날이라 넣지 않는다 — 덜 센 값이 "그날의 접속자"로 남지 않게. 그래서 실행일 - 29일부터
 * 어제까지 29일을 채운다(오늘은 끝나지 않아 넣지 않는다 — 내일 00:10 배치가 센다). 그 앞은 원천이 없어 행이 없고, 화면은
 * 행이 시작되는 날(`min(active_date)`)부터 접속자를 그린다.
 *
 * 접속자가 없는 날·시장도 0 행을 둔다 — 행이 없는 날은 "기록 없음"으로 읽는다. 시장 값은 `UserMarket`(kr·global)과 같다.
 * 이미 탈퇴한 사람의 세션은 함께 지워져(CASCADE) 백필 값에 없다(덜 세는 쪽).
 */
export class AddDailyActiveUsers1790800000000 implements MigrationInterface {
  name = 'AddDailyActiveUsers1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "daily_active_users" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "active_date" date NOT NULL,
         "market" character varying(10) NOT NULL,
         "active_users" integer NOT NULL DEFAULT '0',
         CONSTRAINT "PK_daily_active_users_active_date_market" PRIMARY KEY ("active_date", "market")
       )`,
    );
    await queryRunner.query(
      `WITH bounds AS (
         SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS today
       ),
       days AS (
         SELECT d::date AS active_date
           FROM bounds, generate_series(bounds.today - 29, bounds.today - 1, interval '1 day') AS d
       ),
       counted AS (
         SELECT (s.issued_at AT TIME ZONE 'Asia/Seoul')::date AS active_date,
                u.market,
                count(DISTINCT s.user_id)::int AS active_users
           FROM sessions s
           JOIN users u ON u.id = s.user_id, bounds
          WHERE s.issued_at >= (bounds.today - 29)::timestamp AT TIME ZONE 'Asia/Seoul'
            AND s.issued_at < bounds.today::timestamp AT TIME ZONE 'Asia/Seoul'
          GROUP BY 1, 2
       )
       INSERT INTO "daily_active_users" ("active_date", "market", "active_users")
       SELECT days.active_date, m.market, coalesce(counted.active_users, 0)
         FROM days
        CROSS JOIN (VALUES ('kr'), ('global')) AS m(market)
         LEFT JOIN counted ON counted.active_date = days.active_date AND counted.market = m.market`,
    );
  }

  /** 되돌리면 쌓인 날이 사라진다 — 원천(`sessions`)은 30일만 남아 그 앞은 다시 만들 수 없으니 되돌리기 전에 덤프해 둔다 */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "daily_active_users"`);
  }
}
