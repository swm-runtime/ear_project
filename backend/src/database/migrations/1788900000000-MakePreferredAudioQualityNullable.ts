import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `user_settings.preferred_audio_quality` — NOT NULL DEFAULT 'compressed' → NULL 허용, 기본 없음(domain.md 3.5, 2026-10-06).
 * `NULL` = "고른 적 없음"이고 발급은 티어가 허용하는 가장 높은 선택지로 판정한다(player.md 4.9 — Pro 는 무손실).
 * 종전 기본값 `compressed`는 "직접 압축을 고름"과 구분되지 않아 Pro 가 설정을 건드리지 않으면 영영 압축을 받았다.
 *
 * 기존 행을 전부 NULL 로 되돌린다 — 앱에 음질 선택 UI 가 아직 없어(KAN-143) 사용자가 고른 값이 있을 수 없다. 전부 기본값이다.
 */
export class MakePreferredAudioQualityNullable1788900000000 implements MigrationInterface {
  name = 'MakePreferredAudioQualityNullable1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings"
         ALTER COLUMN "preferred_audio_quality" DROP NOT NULL,
         ALTER COLUMN "preferred_audio_quality" DROP DEFAULT`,
    );
    await queryRunner.query(
      `UPDATE "user_settings" SET "preferred_audio_quality" = NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "user_settings" SET "preferred_audio_quality" = 'compressed' WHERE "preferred_audio_quality" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings"
         ALTER COLUMN "preferred_audio_quality" SET DEFAULT 'compressed',
         ALTER COLUMN "preferred_audio_quality" SET NOT NULL`,
    );
  }
}
