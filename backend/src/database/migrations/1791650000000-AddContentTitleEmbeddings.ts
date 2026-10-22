import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 검색 의미 엔진의 **제목 임베딩**(domain.md 5.6 개정 요청 — `docs/changes/pending/search-title-embeddings.md`).
 *
 * 짧은 질의("금리"·"아두이노")와 대본 전문 벡터의 코사인은 0.2~0.3대에 몰려 관련·무관이 갈리지 않는다(2026-10-22 개발계 실측,
 * `scripts/measure-search-embeddings.js`). 같은 질의를 **제목** 벡터와 비교하면 관련 편이 0.35~0.75로 올라온다 — 그래서
 * 콘텐츠당 제목 벡터 1행을 따로 둔다.
 *
 * - 대본 벡터(`content_embeddings`)와 **다른 표**다 — 그 표는 추천 스코어링·관련 콘텐츠·관리자 표시·동기화가 "콘텐츠당 1행"으로
 *   읽는다. 종류 열을 넣으면 그 읽기 전부에 조건을 더해야 하고, 하나라도 빠지면 제목 벡터가 추천 축에 섞인다.
 * - 유효 조건은 `model` 일치 + **`source_text` = 현재 `contents.title`** — 대본 버전(`content_version`)이 아니라 임베딩한 글자
 *   그대로를 대조한다. 제목만 바꾸는 재발행은 버전을 올리지 않으므로 버전 대조로는 낡은 벡터를 못 가린다.
 * - 생성은 서버가 발행·재발행 커밋 뒤 AI 서버 `POST /embeddings`로 한다(최선 노력) — 실패하면 행이 없고 검색은 대본 벡터만 본다.
 */
export class AddContentTitleEmbeddings1791650000000 implements MigrationInterface {
  name = 'AddContentTitleEmbeddings1791650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "content_title_embeddings" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "content_id" uuid NOT NULL, "embedding" vector(1536) NOT NULL, "model" character varying(100) NOT NULL, "source_text" character varying(255) NOT NULL, CONSTRAINT "uq_content_title_embeddings_content_id" UNIQUE ("content_id"), CONSTRAINT "PK_content_title_embeddings" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_title_embeddings" ADD CONSTRAINT "fk_content_title_embeddings_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "content_title_embeddings" DROP CONSTRAINT "fk_content_title_embeddings_contents"`,
    );
    await queryRunner.query(`DROP TABLE "content_title_embeddings"`);
  }
}
