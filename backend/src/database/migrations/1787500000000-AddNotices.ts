import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `notices` — 공지사항 게시판(KAN-67, `changes/pending/notice-screen-spec.md` D).
 *
 * 목록 인덱스는 **사용자 목록 정렬 그대로**(`is_pinned DESC, published_at DESC`) 두고 삭제분을 뺀
 * 부분 인덱스다 — 조회는 늘 삭제 안 된 발행 공지만 본다. 공지는 수십 건 규모라 인덱스가 없어도
 * 느리지 않지만, 문서가 정한 스키마를 그대로 따른다.
 */
export class AddNotices1787500000000 implements MigrationInterface {
  name = 'AddNotices1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notices" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "title" character varying(100) NOT NULL,
         "body" text NOT NULL,
         "is_pinned" boolean NOT NULL DEFAULT false,
         "published_at" TIMESTAMP WITH TIME ZONE,
         "deleted_at" TIMESTAMP WITH TIME ZONE,
         CONSTRAINT "pk_notices" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notices_list" ON "notices" ("is_pinned" DESC, "published_at" DESC) WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_notices_list"`);
    await queryRunner.query(`DROP TABLE "notices"`);
  }
}
