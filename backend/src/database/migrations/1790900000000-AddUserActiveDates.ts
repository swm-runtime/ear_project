import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `user_active_dates` (domain.md 3.3-2 신설 요청 — `changes/pending/insights-retention-cohorts.md`, 2026-10-18).
 *
 * 서비스 지표의 코호트 리텐션(D1·D7·W1~W4)은 "그 사람이 그날 앱을 열었나"를 사람마다 알아야 한다. `daily_active_users`는
 * 날짜별 인원 수뿐이라 쓸 수 없고, 원천인 `sessions`는 만료·폐기 30일 뒤 지워져(domain.md 12.1) W4(가입 28~34일 뒤)를
 * 셀 무렵이면 앞쪽이 사라진다. 그래서 날이 끝나면(`DailyActiveUserScheduler`, 00:10 KST) 사람·날짜 한 쌍을 이 표에 남긴다.
 *
 * **백필은 지금 남아 있는 세션 전부다** — `daily_active_users`와 달리 경계를 자르지 않는다. 이 표는 "그날 접속했다"는 사실만
 * 담아, 일부가 지워진 날의 행도 틀린 값이 아니다(빠진 사람이 있을 뿐 — 덜 세는 쪽). 리텐션이 "기록을 믿을 수 있는 첫 날" 앞의
 * 칸을 따로 표시한다(`active_users_since`).
 *
 * 사용자를 가리키는 열이 있어 **탈퇴하면 함께 지운다**(`users` FK ON DELETE CASCADE — domain.md 12.3 즉시 파기).
 */
export class AddUserActiveDates1790900000000 implements MigrationInterface {
  name = 'AddUserActiveDates1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_active_dates" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "user_id" uuid NOT NULL,
         "active_date" date NOT NULL,
         CONSTRAINT "PK_user_active_dates_user_id_active_date" PRIMARY KEY ("user_id", "active_date"),
         CONSTRAINT "fk_user_active_dates_users"
           FOREIGN KEY ("user_id") REFERENCES "users"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION
       )`,
    );
    await queryRunner.query(
      `INSERT INTO "user_active_dates" ("user_id", "active_date")
       SELECT DISTINCT s.user_id, (s.issued_at AT TIME ZONE 'Asia/Seoul')::date
         FROM sessions s
       ON CONFLICT DO NOTHING`,
    );
  }

  /** 되돌리면 쌓인 날이 사라진다 — 원천(`sessions`)은 30일만 남아 그 앞은 다시 만들 수 없으니 되돌리기 전에 덤프해 둔다 */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_active_dates"`);
  }
}
