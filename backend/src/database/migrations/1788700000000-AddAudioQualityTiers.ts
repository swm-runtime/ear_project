import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 음질 3단계(KAN-141 — domain.md 1.3-1 · 3.5 · 5.8 · 8.1).
 * - `content_audio_renditions` 신설 + 기존 콘텐츠의 `compressed` 행 백필(`contents.audio_path`에서, 코덱 mp3, 부속값 NULL)
 * - `plans.max_audio_quality`: light·daily·trial = aac, pro = lossless
 * - `user_settings.preferred_audio_quality`: 기본 compressed
 */
export class AddAudioQualityTiers1788700000000 implements MigrationInterface {
  name = 'AddAudioQualityTiers1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "content_audio_renditions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "content_id" uuid NOT NULL,
        "quality" character varying(20) NOT NULL,
        "path" character varying(512) NOT NULL,
        "codec" character varying(16) NOT NULL,
        "bitrate_kbps" integer,
        "channels" smallint,
        "sample_rate_hz" integer,
        "byte_size" bigint,
        "duration_sec" integer NOT NULL,
        CONSTRAINT "pk_content_audio_renditions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_content_audio_renditions_content_id_quality" UNIQUE ("content_id", "quality"),
        CONSTRAINT "fk_content_audio_renditions_content_id" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE
      )
    `);
    // 기존 발행분은 압축 음질 하나뿐이다 — 경로를 그대로 옮기고 모르는 값은 비운다
    await queryRunner.query(`
      INSERT INTO "content_audio_renditions" ("content_id", "quality", "path", "codec", "duration_sec")
      SELECT "id", 'compressed', "audio_path", CASE WHEN "audio_path" LIKE '%.m4a' THEN 'aac' ELSE 'mp3' END, "duration_sec"
      FROM "contents"
      ON CONFLICT ON CONSTRAINT "uq_content_audio_renditions_content_id_quality" DO NOTHING
    `);
    await queryRunner.query(
      `ALTER TABLE "plans" ADD "max_audio_quality" character varying(20) NOT NULL DEFAULT 'aac'`,
    );
    await queryRunner.query(
      `UPDATE "plans" SET "max_audio_quality" = 'lossless' WHERE "tier" = 'pro'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "preferred_audio_quality" character varying(20) NOT NULL DEFAULT 'compressed'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "preferred_audio_quality"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" DROP COLUMN "max_audio_quality"`,
    );
    await queryRunner.query(`DROP TABLE "content_audio_renditions"`);
  }
}
