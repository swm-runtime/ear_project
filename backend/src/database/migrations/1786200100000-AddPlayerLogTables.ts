import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 6.5 · 6.6 — 플레이어가 남기는 로그 테이블 둘.
 *
 * **한 마이그레이션에 담은 이유**는 둘 다 플레이어 계약(`player-api.md` 4.1 · 4.5)이
 * 요구하는 신설이고 같은 배포에 함께 나가야 하기 때문이다. 어느 한쪽만 적용된 상태는
 * 의미가 없다 — 발급은 되는데 기록이 없거나, 그 반대다.
 *
 * **FK에 `ON DELETE CASCADE`를 건다.** 둘 다 탈퇴 시 즉시 파기 대상이다(domain.md 12.3).
 * 확정된 `content_stats` 집계값은 남는다 — `play_records`와 같은 논리다.
 *
 * `audio_access_logs`에 `signed_url` 컬럼이 없는 것은 누락이 아니라 **금지**다
 * (`architecture.md` 9.4 — DB에 남기면 그것이 곧 유출 경로다).
 */
export class AddPlayerLogTables1786200100000 implements MigrationInterface {
  name = 'AddPlayerLogTables1786200100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audio_access_logs" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" BIGSERIAL NOT NULL, "content_id" uuid NOT NULL, "user_id" uuid NOT NULL, "device_id" character varying(200) NOT NULL, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ip_hash" character varying(64), CONSTRAINT "PK_audio_access_logs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audio_access_logs_content_id_issued_at" ON "audio_access_logs" ("content_id", "issued_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audio_access_logs_user_id_issued_at" ON "audio_access_logs" ("user_id", "issued_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "audio_access_logs" ADD CONSTRAINT "fk_audio_access_logs_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audio_access_logs" ADD CONSTRAINT "fk_audio_access_logs_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "source_link_clicks" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" BIGSERIAL NOT NULL, "user_id" uuid NOT NULL, "content_id" uuid NOT NULL, CONSTRAINT "PK_source_link_clicks" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_source_link_clicks_content_id_created_at" ON "source_link_clicks" ("content_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_source_link_clicks_user_id" ON "source_link_clicks" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_link_clicks" ADD CONSTRAINT "fk_source_link_clicks_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_link_clicks" ADD CONSTRAINT "fk_source_link_clicks_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "source_link_clicks" DROP CONSTRAINT "fk_source_link_clicks_contents"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_link_clicks" DROP CONSTRAINT "fk_source_link_clicks_users"`,
    );
    await queryRunner.query(`DROP TABLE "source_link_clicks"`);

    await queryRunner.query(
      `ALTER TABLE "audio_access_logs" DROP CONSTRAINT "fk_audio_access_logs_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audio_access_logs" DROP CONSTRAINT "fk_audio_access_logs_contents"`,
    );
    await queryRunner.query(`DROP TABLE "audio_access_logs"`);
  }
}
