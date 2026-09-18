import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `content_scripts` — 대본(자막) 세그먼트(domain.md 5.3, FR-25 — KAN-71 로 실서버에 연다).
 * 콘텐츠당 1행(`uq_content_scripts_content_id`), 세그먼트는 jsonb 한 컬럼.
 * 콘텐츠가 지워지면 함께 지워진다(FK CASCADE) — 스크립트만 남을 이유가 없다.
 */
export class AddContentScripts1787700000000 implements MigrationInterface {
  name = 'AddContentScripts1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "content_scripts" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "content_id" uuid NOT NULL,
         "segments" jsonb NOT NULL,
         CONSTRAINT "pk_content_scripts" PRIMARY KEY ("id"),
         CONSTRAINT "uq_content_scripts_content_id" UNIQUE ("content_id"),
         CONSTRAINT "fk_content_scripts_contents" FOREIGN KEY ("content_id")
           REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE NO ACTION
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "content_scripts"`);
  }
}
