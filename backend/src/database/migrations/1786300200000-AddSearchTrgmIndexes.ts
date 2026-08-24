import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 5.1 — 검색(FR-22, MVP)의 `pg_trgm` 트라이그램 GIN 인덱스 (확정 2026-08-23).
 *
 * 검색 대상 4필드(제목·설명·저자·주제명) 중 `contents` 3필드에만 건다 —
 * **`topics.name`에는 인덱스를 두지 않는다**(주제 수십 개 수준이라 순차 스캔으로 충분).
 *
 * 2자 질의는 트라이그램(3자)을 추출하지 못해 이 인덱스를 타지 못한다 — 초기 콘텐츠 풀
 * 규모에서는 순차 스캔을 허용하며, 대응 방침은 `explore.md` 4.5-5가 정한다(최소 길이
 * 상향 금지 — "이직"·"면접" 같은 한국어 2자 검색어가 흔하다).
 *
 * down에서 확장은 지우지 않는다 — 다른 마이그레이션·수동 작업이 같은 확장을 쓰고 있을 수
 * 있고, `CREATE EXTENSION IF NOT EXISTS`라 재실행에도 안전하다.
 */
export class AddSearchTrgmIndexes1786300200000 implements MigrationInterface {
  name = 'AddSearchTrgmIndexes1786300200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `CREATE INDEX "idx_contents_title_trgm" ON "contents" USING GIN ("title" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contents_description_trgm" ON "contents" USING GIN ("description" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contents_author_name_trgm" ON "contents" USING GIN ("author_name" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_contents_author_name_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_contents_description_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_contents_title_trgm"`);
  }
}
