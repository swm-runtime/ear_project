import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 검색 질의 로그(domain.md 5.7) — 키워드 검색 첫 페이지 요청 1회 = 1행.
 *
 * `explore.md` 4.5-5가 "검색 쿼리 로그로 미스율을 확인한 뒤 매칭 방식을 재검토한다"고 정해
 * 두고도 그 로그가 없었다. 질의(정규화값)·첫 페이지 건수·다음 페이지 유무·주제 필터 수를 남긴다.
 * 대량 로그성 테이블이라 PK는 `bigserial`(1.1), `user_id`는 ON DELETE CASCADE(12.3 즉시 파기),
 * 보존은 `created_at` 90일(12.1 — `RetentionModule`이 집행).
 */
export class AddSearchQueryLogs1788100000000 implements MigrationInterface {
  name = 'AddSearchQueryLogs1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "search_query_logs" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" BIGSERIAL NOT NULL,
         "user_id" uuid NOT NULL,
         "query" character varying(100) NOT NULL,
         "result_count" smallint NOT NULL,
         "has_next" boolean NOT NULL,
         "topic_filter_count" smallint NOT NULL,
         CONSTRAINT "pk_search_query_logs" PRIMARY KEY ("id"),
         CONSTRAINT "ck_search_query_logs_result_count" CHECK ("result_count" >= 0),
         CONSTRAINT "ck_search_query_logs_topic_filter_count" CHECK ("topic_filter_count" >= 0),
         CONSTRAINT "fk_search_query_logs_users"
           FOREIGN KEY ("user_id") REFERENCES "users"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_search_query_logs_user_id_created_at" ON "search_query_logs" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_search_query_logs_created_at" ON "search_query_logs" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_search_query_logs_created_at"`);
    await queryRunner.query(
      `DROP INDEX "idx_search_query_logs_user_id_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "search_query_logs"`);
  }
}
