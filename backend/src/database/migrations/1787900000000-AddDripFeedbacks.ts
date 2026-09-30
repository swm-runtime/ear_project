import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 추천 온라인 평가(KAN-116, `drip-feedback.md`) — 세 가지.
 *
 * - `library_items.algorithm_version`: 편성분을 고른 알고리즘 버전(`DRIP_ALGORITHM_VERSION`). 기존 행은 NULL(버전 도입
 *   이전)로 남긴다 — 소급해 채우면 다른 알고리즘의 결과가 한 버전으로 뭉친다.
 * - `drip_feedbacks`(domain.md 6.7): 사용자가 편성분에 매긴 별 1~5. `(user_id, content_id)` 유니크 — 같은 콘텐츠의
 *   재전송은 덮어쓴다. `user_id`는 ON DELETE CASCADE(12.3 즉시 파기).
 * - `user_settings.drip_feedback_muted_until`: [이번 주 그만 보기]의 종료 서비스 날짜.
 */
export class AddDripFeedbacks1787900000000 implements MigrationInterface {
  name = 'AddDripFeedbacks1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "library_items" ADD "algorithm_version" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "drip_feedback_muted_until" date`,
    );
    await queryRunner.query(
      `CREATE TABLE "drip_feedbacks" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "user_id" uuid NOT NULL,
         "content_id" uuid NOT NULL,
         "source" character varying(20) NOT NULL,
         "algorithm_version" character varying(40),
         "placed_date" date NOT NULL,
         "stars" smallint NOT NULL,
         CONSTRAINT "pk_drip_feedbacks" PRIMARY KEY ("id"),
         CONSTRAINT "uq_drip_feedbacks_user_id_content_id" UNIQUE ("user_id", "content_id"),
         CONSTRAINT "ck_drip_feedbacks_stars" CHECK ("stars" BETWEEN 1 AND 5),
         CONSTRAINT "fk_drip_feedbacks_users"
           FOREIGN KEY ("user_id") REFERENCES "users"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION,
         CONSTRAINT "fk_drip_feedbacks_contents"
           FOREIGN KEY ("content_id") REFERENCES "contents"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_drip_feedbacks_algorithm_version_created_at" ON "drip_feedbacks" ("algorithm_version", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_library_items_algorithm_version" ON "library_items" ("algorithm_version") WHERE "algorithm_version" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_library_items_algorithm_version"`);
    await queryRunner.query(
      `DROP INDEX "idx_drip_feedbacks_algorithm_version_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "drip_feedbacks"`);
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "drip_feedback_muted_until"`,
    );
    await queryRunner.query(
      `ALTER TABLE "library_items" DROP COLUMN "algorithm_version"`,
    );
  }
}
