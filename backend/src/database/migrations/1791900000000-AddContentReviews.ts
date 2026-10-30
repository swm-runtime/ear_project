import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 콘텐츠 후기(KAN-279 — `content-review.md`, domain.md 6.8 · 3.5).
 *
 * - `content_reviews`: 사용자가 편 자체에 남긴 별 1~5 + 글(앞뒤 공백을 뺀 500자, 없으면 NULL). `(user_id, content_id)` 유니크 —
 *   다시 보내면 그 시점 값으로 덮어쓴다. 후기 시점의 완청 여부 · `content_version` · 사용자 시장을 함께 남긴다.
 *   `user_id` · `content_id`는 ON DELETE CASCADE(12.3 즉시 파기). **추천 입력이 아니다** — 어떤 스코어링도 읽지 않는다.
 * - `user_settings.content_review_last_prompted_date` · `content_review_muted_until`: 먼저 묻는 시트의 "물은 날"과
 *   [이번 주 그만 보기] 종료 라벨. 추천 별점의 두 칸과 따로 둔다.
 *
 * 인덱스 방향(`updated_at DESC, id DESC`)은 조회 의도(최신순)다 — 관리자 편별 · 전체 글 목록의 keyset.
 */
export class AddContentReviews1791900000000 implements MigrationInterface {
  name = 'AddContentReviews1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "content_review_last_prompted_date" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "content_review_muted_until" date`,
    );
    await queryRunner.query(
      `CREATE TABLE "content_reviews" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "user_id" uuid NOT NULL,
         "content_id" uuid NOT NULL,
         "stars" smallint NOT NULL,
         "text" character varying(500),
         "is_completed" boolean NOT NULL,
         "content_version" integer NOT NULL,
         "market" character varying(20) NOT NULL,
         CONSTRAINT "pk_content_reviews" PRIMARY KEY ("id"),
         CONSTRAINT "uq_content_reviews_user_id_content_id" UNIQUE ("user_id", "content_id"),
         CONSTRAINT "ck_content_reviews_stars" CHECK ("stars" BETWEEN 1 AND 5),
         CONSTRAINT "fk_content_reviews_users"
           FOREIGN KEY ("user_id") REFERENCES "users"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION,
         CONSTRAINT "fk_content_reviews_contents"
           FOREIGN KEY ("content_id") REFERENCES "contents"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_content_reviews_content_id_updated_at" ON "content_reviews" ("content_id", "updated_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_content_reviews_updated_at" ON "content_reviews" ("updated_at" DESC, "id" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_content_reviews_updated_at"`);
    await queryRunner.query(
      `DROP INDEX "idx_content_reviews_content_id_updated_at"`,
    );
    await queryRunner.query(`DROP TABLE "content_reviews"`);
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "content_review_muted_until"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "content_review_last_prompted_date"`,
    );
  }
}
