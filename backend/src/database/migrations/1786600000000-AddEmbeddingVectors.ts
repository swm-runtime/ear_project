import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 임베딩 모델 확정(OpenAI text-embedding-3-small · 1536차원 — domain.md 15.1 #11 해소
 * 2026-09-01)으로 미뤄뒀던 벡터 스키마를 작성한다.
 *
 * - 확장 `pgvector` (domain.md 5.6 — 5.1의 pg_trgm과 같은 방식)
 * - `content_embeddings` — 대본 임베딩. 생성은 AI 서버, 저장은 업로드 시 서버(domain.md 5.6)
 * - `user_preference_vectors.taste_embedding` — 취향 벡터(domain.md 7.2, 편성 배치가 계산)
 *
 * **로컬 개발 주의**: `postgres` 표준 이미지에는 pgvector가 없다 — `docker-compose.yml`을
 * `pgvector/pgvector:pg16`으로 바꾼 뒤(`docker compose up -d`로 재생성, 데이터 볼륨 유지)
 * 실행해야 한다. 운영 환경(RDS 등)은 pgvector 지원 확인이 배포 체크리스트다.
 */
export class AddEmbeddingVectors1786600000000 implements MigrationInterface {
  name = 'AddEmbeddingVectors1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(
      `CREATE TABLE "content_embeddings" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "content_id" uuid NOT NULL, "embedding" vector(1536) NOT NULL, "model" character varying(100) NOT NULL, "content_version" integer NOT NULL DEFAULT '1', CONSTRAINT "uq_content_embeddings_content_id" UNIQUE ("content_id"), CONSTRAINT "PK_content_embeddings" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_embeddings" ADD CONSTRAINT "fk_content_embeddings_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "user_preference_vectors" ADD "taste_embedding" vector(1536)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_preference_vectors" DROP COLUMN "taste_embedding"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_embeddings" DROP CONSTRAINT "fk_content_embeddings_contents"`,
    );
    await queryRunner.query(`DROP TABLE "content_embeddings"`);
    // 확장은 내리지 않는다 — 다른 객체가 의존할 수 있고, 재적용 시 IF NOT EXISTS가 흡수한다
  }
}
