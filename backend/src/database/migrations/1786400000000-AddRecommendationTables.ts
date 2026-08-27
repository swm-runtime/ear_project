import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 추천 스코어링 고도화(README 결정 51·52 — `drip-scheduling.md` 4.2·4.8)의 스키마 반영.
 *
 * 한 마이그레이션에 담은 이유: 전부 같은 기능(3축 하이브리드 편성 배치)의 입력·출력이라
 * 어느 한쪽만 적용된 상태가 의미 없다.
 *
 * - `contents` 추천 메타 4종 (domain.md 5.1 — 전부 NULL 허용, 발행 요건이 아니다)
 * - `plans.daily_discovery_count` (domain.md 8.1 — 탐험 편성 편수, 전 티어 1)
 * - `user_preference_vectors` (domain.md 7.2 — 신호 집계 파생 캐시)
 * - `drip_batch_runs` (domain.md 7.3 — 배치 중복 실행 방지 + 운영 기록)
 *
 * **`content_embeddings`와 `user_preference_vectors.taste_embedding`은 없다** —
 * 임베딩 모델·차원 미확정 상태에서는 벡터 컬럼 마이그레이션을 만들지 않는다
 * (domain.md 15.1 #11). `library_items.source`의 `discovery` 값은 varchar라
 * 스키마 변경이 필요 없다(convention.md 4.2 — DB enum을 쓰지 않는다).
 */
export class AddRecommendationTables1786400000000 implements MigrationInterface {
  name = 'AddRecommendationTables1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "difficulty" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "format" character varying(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "is_evergreen" boolean`,
    );
    await queryRunner.query(`ALTER TABLE "contents" ADD "keywords" jsonb`);

    await queryRunner.query(
      `ALTER TABLE "plans" ADD "daily_discovery_count" integer NOT NULL DEFAULT '1'`,
    );

    await queryRunner.query(
      `CREATE TABLE "user_preference_vectors" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "topic_weights" jsonb NOT NULL DEFAULT '{}', "author_weights" jsonb NOT NULL DEFAULT '{}', "keyword_weights" jsonb NOT NULL DEFAULT '{}', "format_weights" jsonb NOT NULL DEFAULT '{}', "duration_pref" jsonb, "signal_count" integer NOT NULL DEFAULT '0', CONSTRAINT "uq_user_preference_vectors_user_id" UNIQUE ("user_id"), CONSTRAINT "PK_user_preference_vectors" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preference_vectors" ADD CONSTRAINT "fk_user_preference_vectors_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "drip_batch_runs" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "run_date" date NOT NULL, "target_count" integer NOT NULL DEFAULT '0', "success_count" integer NOT NULL DEFAULT '0', "skipped_count" integer NOT NULL DEFAULT '0', "failed_count" integer NOT NULL DEFAULT '0', "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "finished_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_drip_batch_runs_run_date" UNIQUE ("run_date"), CONSTRAINT "PK_drip_batch_runs" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "drip_batch_runs"`);
    await queryRunner.query(
      `ALTER TABLE "user_preference_vectors" DROP CONSTRAINT "fk_user_preference_vectors_users"`,
    );
    await queryRunner.query(`DROP TABLE "user_preference_vectors"`);
    await queryRunner.query(
      `ALTER TABLE "plans" DROP COLUMN "daily_discovery_count"`,
    );
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN "keywords"`);
    await queryRunner.query(
      `ALTER TABLE "contents" DROP COLUMN "is_evergreen"`,
    );
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN "format"`);
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN "difficulty"`);
  }
}
