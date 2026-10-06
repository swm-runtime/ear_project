import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 스토어 리뷰 Slack 연동(KAN-133 VoC) — `store_reviews`(domain.md).
 *
 * App Store·Google Play 리뷰를 15분마다 조회해 Slack에 올릴 때 "이미 알린 리뷰인가, 그 뒤 수정됐는가"를 가리는
 * 기록이다. **본문·닉네임 컬럼이 없는 것은 의도다** — 중복 감지에 필요 없고, 닉네임은 어디에도 옮기지 않는다.
 * `(store, review_id)` 유니크 위에서 upsert 한다. `notified_at`이 NULL이면 첫 실행에 기록만 한 행이다.
 */
export class AddStoreReviews1788600000000 implements MigrationInterface {
  name = 'AddStoreReviews1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "store_reviews" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "store" character varying(20) NOT NULL,
         "review_id" character varying(128) NOT NULL,
         "rating" smallint NOT NULL,
         "last_modified_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "notified_at" TIMESTAMP WITH TIME ZONE,
         CONSTRAINT "pk_store_reviews" PRIMARY KEY ("id"),
         CONSTRAINT "uq_store_reviews_store_review_id" UNIQUE ("store", "review_id")
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "store_reviews"`);
  }
}
