import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `library_items.queue_position` — 사용자가 정한 재생 목록 순서(KAN-70, `library-api.md` 4.8).
 *
 * NULL = 순서 미지정. 목록은 `queue_position ASC NULLS FIRST, added_at DESC, id DESC`로 읽어
 * **새로 담긴 항목이 최신순으로 맨 위**, 그 아래 저장한 순서가 온다. 인덱스도 그 정렬 그대로 —
 * TypeORM `@Index`는 NULLS FIRST·방향을 표현하지 못해 여기서 정확한 정의를 만든다.
 */
export class AddLibraryItemQueuePosition1787600000000 implements MigrationInterface {
  name = 'AddLibraryItemQueuePosition1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "library_items" ADD "queue_position" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_library_items_user_id_deleted_at_queue_position"
         ON "library_items" ("user_id", "deleted_at", "queue_position" ASC NULLS FIRST, "added_at" DESC, "id" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_library_items_user_id_deleted_at_queue_position"`,
    );
    await queryRunner.query(
      `ALTER TABLE "library_items" DROP COLUMN "queue_position"`,
    );
  }
}
