import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `content_scripts.sections` — 구간 제목 `[{ start_sec, title }]`(domain.md 5.3, KAN-144).
 * 자막과 같은 행에 둔다 — 시각이 오디오에 묶여 있어 자막과 운명이 같다(함께 교체·함께 삭제).
 * 기존 행은 구간 없음(`[]`)으로 시작한다 — 지금 앱에 나가 있는 오디오와 맞는 구간 시각은 소급해 만들
 * 수 없고, 재발행(새 오디오 + 자막 + 구간)에서 함께 실린다.
 */
export class AddContentScriptSections1788800000000 implements MigrationInterface {
  name = 'AddContentScriptSections1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "content_scripts"
         ADD COLUMN "sections" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "content_scripts" DROP COLUMN "sections"`,
    );
  }
}
