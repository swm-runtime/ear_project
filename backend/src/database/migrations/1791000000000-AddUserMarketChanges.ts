import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `user_market_changes` (domain.md 3.4-1 — `global-api.md` 4.11, 2026-10-19 KAN-227).
 *
 * 가입 뒤 시장 전환이 생겼다. 전환은 서비스 날짜당 1회라 "오늘 이미 바꿨나"를 알 근거가 필요하고, 시장별 집계가 현재 시장
 * 기준이라 전환 수를 따로 세야 한다. 사용자를 가리키는 열이 있어 **탈퇴하면 함께 지운다**(`users` FK ON DELETE CASCADE —
 * domain.md 12.3 즉시 파기). 새 표라 백필할 것이 없다 — 지금까지는 전환 경로가 없었다.
 */
export class AddUserMarketChanges1791000000000 implements MigrationInterface {
  name = 'AddUserMarketChanges1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_market_changes" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "user_id" uuid NOT NULL,
         "from_market" character varying(10) NOT NULL,
         "to_market" character varying(10) NOT NULL,
         "is_revert" boolean NOT NULL DEFAULT false,
         "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         CONSTRAINT "PK_user_market_changes_id" PRIMARY KEY ("id"),
         CONSTRAINT "fk_user_market_changes_users"
           FOREIGN KEY ("user_id") REFERENCES "users"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_user_market_changes_user_id_changed_at" ON "user_market_changes" ("user_id", "changed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_user_market_changes_user_id_changed_at"`,
    );
    await queryRunner.query(`DROP TABLE "user_market_changes"`);
  }
}
