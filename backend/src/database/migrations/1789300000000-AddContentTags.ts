import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `contents.tags` — 화면 해시태그(domain.md 5.1, 2026-10-08 KAN-162). 추천 메타 형식 3(`enrichment.json`의 `tags`)으로
 * 받아 탐색 카드·상세 화면에 내려 준다. 기존 행은 NULL(받은 적 없음) — 응답에서는 빈 배열이고,
 * 파이프라인이 [다시 뽑기 → 반영]으로 소급한다.
 */
export class AddContentTags1789300000000 implements MigrationInterface {
  name = 'AddContentTags1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contents" ADD COLUMN "tags" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN "tags"`);
  }
}
