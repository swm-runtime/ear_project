import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 추천 별점 팝업은 **가장 최근 편성분에 대해 한 번만** 묻는다(`drip-feedback.md` 4.1 — 개정 2026-09-30).
 * 마지막으로 물은(별점을 보냈거나 닫은) 편성분의 서비스 날짜를 남겨, 그 뒤 새 편성이 없으면 다시 묻지 않는다.
 */
export class AddDripFeedbackLastPromptedDate1788000000000 implements MigrationInterface {
  name = 'AddDripFeedbackLastPromptedDate1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "drip_feedback_last_prompted_date" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "drip_feedback_last_prompted_date"`,
    );
  }
}
