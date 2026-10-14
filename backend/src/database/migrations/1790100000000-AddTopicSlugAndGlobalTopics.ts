import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 글로벌 3 — 주제 slug와 GLOBAL 주제 8개(KAN-189, `global-api.md` 4.5).
 *
 * - `topics.slug`(NULL 허용) + 시장 안 유일. 기존 KR 주제는 NULL로 두고 운영이 채운다 — 이름에서 기계적으로 만들 수 없다(한글).
 * - GLOBAL 주제 8개는 `docs/ai/global/PIPELINE.md`(AI 파트, 2026-10-14 확정)의 표 그대로다. 중분류가 없는 1단계 체계라
 *   `parent_category`에는 주제 이름을 그대로 넣는다(컬럼 NOT NULL 유지 — 응답 계약을 바꾸지 않기 위해).
 * - **숨김(`is_visible = false`)으로 넣는다**(domain.md 4.1 — 콘텐츠가 들어온 뒤 운영이 켠다). 그래서 KR 사용자는 물론 GLOBAL
 *   사용자에게도 아직 보이지 않는다.
 */
const GLOBAL_TOPICS: [name: string, slug: string][] = [
  ['Korean Language', 'korean-language'],
  ['K-Food', 'k-food'],
  ['K-Pop', 'k-pop'],
  ['K-Drama & Film', 'k-drama-film'],
  ['Korean Culture', 'korean-culture'],
  ['K-Beauty & Fashion', 'k-beauty-fashion'],
  ['Korean History & Society', 'korean-history-society'],
  ['Travel in Korea', 'travel-in-korea'],
];

export class AddTopicSlugAndGlobalTopics1790100000000 implements MigrationInterface {
  name = 'AddTopicSlugAndGlobalTopics1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "topics" ADD "slug" character varying(64)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_topics_market_slug" ON "topics" ("market", "slug") WHERE "slug" IS NOT NULL`,
    );

    for (const [index, [name, slug]] of GLOBAL_TOPICS.entries()) {
      await queryRunner.query(
        `INSERT INTO "topics" ("name", "parent_category", "is_visible", "display_order", "market", "slug")
         SELECT $1::varchar, $1::varchar, false, $2::int, 'global', $3::varchar
         WHERE NOT EXISTS (SELECT 1 FROM "topics" WHERE "market" = 'global' AND "slug" = $3::varchar)`,
        [name, index + 1, slug],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 콘텐츠가 붙은 GLOBAL 주제는 FK 때문에 지워지지 않는다 — 그때는 되돌리기 전에 콘텐츠부터 정리해야 한다
    await queryRunner.query(
      `DELETE FROM "topics" WHERE "market" = 'global' AND "slug" = ANY($1::varchar[])`,
      [GLOBAL_TOPICS.map(([, slug]) => slug)],
    );
    await queryRunner.query(`DROP INDEX "uq_topics_market_slug"`);
    await queryRunner.query(`ALTER TABLE "topics" DROP COLUMN "slug"`);
  }
}
