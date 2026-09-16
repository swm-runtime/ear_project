import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `contents.source_name` varchar(100) → varchar(500) (domain.md 5.1, KAN-52).
 *
 * ai_generated 콘텐츠의 `source_name`은 "참고한 자료: 발행처1, 발행처2, …"로 참고 소스의 발행처를
 * **전부** 적는다(admin.md 3.1 — 줄여 쓰지 않기로 한 결정). 영문 매체명이 15~25자라 소스 6건이면
 * 100자를 넘어 발행이 거부됐다(2026-09-10 파이프라인 콘솔). 데이터 이동 없는 타입 확장이다.
 *
 * down은 100자를 넘는 행이 있으면 실패한다 — 그것이 의도다(잘라 넣으면 고지 문구가 훼손된다).
 */
export class WidenContentsSourceName1787100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" ALTER COLUMN "source_name" TYPE character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" ALTER COLUMN "source_name" TYPE character varying(100)`,
    );
  }
}
