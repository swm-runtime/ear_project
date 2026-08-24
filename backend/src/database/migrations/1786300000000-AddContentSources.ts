import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 5.5 — `ai_generated` 콘텐츠의 참고 소스 목록 테이블 (확정 2026-08-24).
 *
 * 콘텐츠 상세 화면(FR-40, `content-detail.md` 4.3)이 소스 단위 표시(제목·저자·링크
 * 전수 나열)를 요구하면서, "복수 소스를 정규화하지 않는다"(구 domain.md 5.1)의 전제가
 * 깨져 예고된 승격 경로대로 테이블로 올렸다. 고지 문구용 `contents.source_name`은
 * 대체하지 않는다.
 *
 * `content_id` 단독 인덱스를 따로 만들지 않는 것은 누락이 아니다 — 유니크
 * `(content_id, position)`의 선두 컬럼이 그 조회를 이미 커버한다.
 *
 * FK에 `ON DELETE CASCADE`를 거는 것은 `content_topics`와 같은 이유다 — 콘텐츠 행이
 * 사라지면 부속 행은 의미가 없다.
 */
export class AddContentSources1786300000000 implements MigrationInterface {
  name = 'AddContentSources1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "content_sources" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "content_id" uuid NOT NULL, "position" integer NOT NULL, "title" character varying(255) NOT NULL, "author" character varying(100), "url" character varying(2048), CONSTRAINT "uq_content_sources_content_id_position" UNIQUE ("content_id", "position"), CONSTRAINT "PK_content_sources" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_sources" ADD CONSTRAINT "fk_content_sources_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "content_sources" DROP CONSTRAINT "fk_content_sources_contents"`,
    );
    await queryRunner.query(`DROP TABLE "content_sources"`);
  }
}
