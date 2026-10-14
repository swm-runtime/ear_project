import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 글로벌 2 — 카탈로그 격리(KAN-188, `global-api.md` 4.5·4.7·4.8·8장).
 *
 * `contents.market/language` · `topics.market` · `notices.market`. 기본값 `kr`/`ko`라 기존 행은 전부 KR 카탈로그이고,
 * 노출 쿼리의 `market = users.market` 필터는 데이터가 전부 `kr`인 동안 결과를 바꾸지 않는다.
 */
export class AddCatalogMarket1790000000000 implements MigrationInterface {
  name = 'AddCatalogMarket1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "market" character varying(20) NOT NULL DEFAULT 'kr'`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "language" character varying(8) NOT NULL DEFAULT 'ko'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contents_market_status_published_at" ON "contents" ("market", "status", "published_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "topics" ADD "market" character varying(20) NOT NULL DEFAULT 'kr'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_topics_market_is_visible_display_order" ON "topics" ("market", "is_visible", "display_order")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notices" ADD "market" character varying(20) NOT NULL DEFAULT 'kr'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notices" DROP COLUMN "market"`);
    await queryRunner.query(
      `DROP INDEX "idx_topics_market_is_visible_display_order"`,
    );
    await queryRunner.query(`ALTER TABLE "topics" DROP COLUMN "market"`);
    await queryRunner.query(
      `DROP INDEX "idx_contents_market_status_published_at"`,
    );
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN "language"`);
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN "market"`);
  }
}
