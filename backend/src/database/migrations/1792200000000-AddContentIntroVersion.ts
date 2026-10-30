import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 도입부 버전(KAN-298 범위 추가 — 2026-10-29) — `contents.intro_version`.
 *
 * - **지표 전용**이다. 짧은 판(`length_profile`)과 새 도입부(훅)의 효과를 떼어 보려고 둔다 — 나중에 standard 편에도 새 도입부가
 *   들어갈 수 있어, 길이 프로필만으로는 초반 이탈(10초·30초·1분)의 원인을 가를 수 없다. 노출 규칙은 이 칸을 보지 않는다.
 * - NULL 허용 · 기본값 없음 — NULL = 기존 도입부(이 칸 이전에 발행한 전부). 기존 행을 채우지 않는다(표를 다시 쓰지 않는다).
 * - CHECK — 32자 이하, 소문자·숫자로 시작하고 소문자·숫자·`.`·`_`·`-`만. 같은 식이 `INTRO_VERSION_PATTERN`(업로드 검증)에
 *   있다. 값의 이름(예 `hook-v2`)은 파이프라인이 정한다.
 * - 인덱스는 두지 않는다 — 지표 집계는 관리자 조회뿐이다.
 * - 되돌리기는 열 삭제다(CHECK가 함께 사라진다).
 */
export class AddContentIntroVersion1792200000000 implements MigrationInterface {
  name = 'AddContentIntroVersion1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "intro_version" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD CONSTRAINT "ck_contents_intro_version" CHECK ("intro_version" IS NULL OR "intro_version" ~ '^[a-z0-9][a-z0-9._-]{0,31}$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" DROP CONSTRAINT "ck_contents_intro_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" DROP COLUMN "intro_version"`,
    );
  }
}
