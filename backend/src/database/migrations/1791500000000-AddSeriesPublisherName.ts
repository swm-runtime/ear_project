import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `series.publisher_name` (domain.md 5.9, 2026-10-22 PM).
 *
 * 시리즈 화면 제목 아래 줄(애플 뮤직 앨범의 아티스트 자리)에 시리즈를 낸 이름("키워드")을 낸다. 종전엔 그 자리에 대표 주제가
 * 나갔고, 주제는 그 아래 줄(종전 "시리즈" 자리)로 내려간다.
 *
 * - **NULL 허용** — 없으면 앱이 그 줄을 생략한다. 기본값 없는 NULL 열 추가라 표를 다시 쓰지 않는다.
 * - **백필**: 제목이 "키워드로"로 시작하는 시리즈(CS 지식·경제 상식 등 키워드 시리즈)만 "키워드"로 채운다. 철학 시리즈 등
 *   다른 묶음은 비워 둔다 — 이름은 관리자가 시리즈 고치기로 넣는다.
 * - 되돌리기는 열 삭제 하나다.
 */
export class AddSeriesPublisherName1791500000000 implements MigrationInterface {
  name = 'AddSeriesPublisherName1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "series" ADD "publisher_name" character varying(50)`,
    );
    await queryRunner.query(
      `UPDATE "series" SET "publisher_name" = '키워드' WHERE "title" LIKE '키워드로%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "series" DROP COLUMN "publisher_name"`,
    );
  }
}
