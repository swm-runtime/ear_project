import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 검색 질의 로그에 **첫 페이지 결과의 콘텐츠 id**를 남긴다(domain.md 5.7 — 결과 반응 추정).
 *
 * "검색하고 결과를 눌렀는가"를 앱 수정 없이 서버에서 가려내기 위한 것이다 — 그 뒤 10분 안에 같은
 * 사용자가 이 결과 중 하나를 재생(`play_records`)하거나 담았으면(`library_items.source = save`) 반응한
 * 검색으로 센다. 기존 행은 빈 배열이라 반응 없음으로 집계된다(이 컬럼 이전의 행은 어차피 며칠치다).
 */
export class AddSearchQueryLogResultContentIds1788200000000 implements MigrationInterface {
  name = 'AddSearchQueryLogResultContentIds1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_query_logs" ADD "result_content_ids" uuid array NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_query_logs" DROP COLUMN "result_content_ids"`,
    );
  }
}
