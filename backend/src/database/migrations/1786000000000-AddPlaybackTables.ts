import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 6.2~6.4 — `playback` 모듈이 소유하는 세 테이블.
 *
 * `play_records` · `user_signals`는 대량 로그성이라 PK가 `bigserial`이다
 * (convention.md 4.2 예외 조항). `playback_progresses`는 user × content 당 1건이라 uuid다.
 *
 * **잔여 재생 횟수를 저장하는 컬럼을 만들지 않는다**(domain.md 1.5) —
 * `daily_play_count`는 `play_records` 집계이며 `users.daily_play_count`는 폐기된 개체다.
 */
export class AddPlaybackTables1786000000000 implements MigrationInterface {
  name = 'AddPlaybackTables1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "playback_progresses" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "content_id" uuid NOT NULL, "position_sec" integer NOT NULL DEFAULT '0', "max_reached_sec" integer NOT NULL DEFAULT '0', CONSTRAINT "uq_playback_progresses_user_id_content_id" UNIQUE ("user_id", "content_id"), CONSTRAINT "PK_a85e0745c9858630b57f3b1c7cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "play_records" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" BIGSERIAL NOT NULL, "user_id" uuid NOT NULL, "content_id" uuid NOT NULL, "play_date" date NOT NULL, "played_at" TIMESTAMP WITH TIME ZONE NOT NULL, "listened_sec" integer NOT NULL DEFAULT '0', CONSTRAINT "uq_play_records_user_id_content_id_play_date" UNIQUE ("user_id", "content_id", "play_date"), CONSTRAINT "PK_b5d45a02e1f56f12d2b0e99543b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_play_records_user_id_play_date" ON "play_records"  ("user_id", "play_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_play_records_content_id_play_date" ON "play_records"  ("content_id", "play_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_signals" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" BIGSERIAL NOT NULL, "user_id" uuid NOT NULL, "content_id" uuid NOT NULL, "action" character varying(20) NOT NULL, "position_sec" integer, "max_reached_sec" integer, CONSTRAINT "PK_fef832be441b0a784cfb47ebf1c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_user_signals_user_id_created_at" ON "user_signals"  ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "playback_progresses" ADD CONSTRAINT "fk_playback_progresses_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "playback_progresses" ADD CONSTRAINT "fk_playback_progresses_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "play_records" ADD CONSTRAINT "fk_play_records_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "play_records" ADD CONSTRAINT "fk_play_records_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_signals" ADD CONSTRAINT "fk_user_signals_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_signals" ADD CONSTRAINT "fk_user_signals_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_signals" DROP CONSTRAINT "fk_user_signals_contents"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_signals" DROP CONSTRAINT "fk_user_signals_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "play_records" DROP CONSTRAINT "fk_play_records_contents"`,
    );
    await queryRunner.query(
      `ALTER TABLE "play_records" DROP CONSTRAINT "fk_play_records_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playback_progresses" DROP CONSTRAINT "fk_playback_progresses_contents"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playback_progresses" DROP CONSTRAINT "fk_playback_progresses_users"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_user_signals_user_id_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "user_signals"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_play_records_content_id_play_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_play_records_user_id_play_date"`,
    );
    await queryRunner.query(`DROP TABLE "play_records"`);
    await queryRunner.query(`DROP TABLE "playback_progresses"`);
  }
}
