import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 5.1 — 출처 필드의 origin 분기(합의 2026-08-06)를 스키마에 실제로 반영한다.
 *
 * `author_name` · `source_url`은 문서상 NULL 허용(ai_generated는 선택)인데 초기
 * 마이그레이션이 NOT NULL로 만들었고, 파트너 필수 고지를 이중 방어하는
 * `chk_contents_partner_disclosure` CHECK도 빠져 있었다. 저자·링크 없는 실제
 * ai_generated 콘텐츠가 저장 불가였던 어긋남을 바로잡는다.
 *
 * **CHECK를 `NOT VALID`로 추가한다** — 기존 개발 시드의 파트너 행이 `partner_id` ·
 * `license_expires_at` 없이 들어가 있어, 즉시 검증하면 팀원들의 시드된 DB에서
 * 마이그레이션이 실패한다. NOT VALID는 신규·수정 행부터 강제하며, 기존 행은 시드
 * 재실행(`npm run seed:mock`)이 백필한다. 운영 데이터 적재 전에 VALIDATE
 * 마이그레이션으로 잠근다(후속 — 지금은 운영 데이터가 없다).
 */
export class AllowNullContentsDisclosure1786300100000 implements MigrationInterface {
  name = 'AllowNullContentsDisclosure1786300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" ALTER COLUMN "author_name" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ALTER COLUMN "source_url" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD CONSTRAINT "chk_contents_partner_disclosure" CHECK (origin <> 'partner' OR (author_name IS NOT NULL AND source_url IS NOT NULL AND partner_id IS NOT NULL AND license_expires_at IS NOT NULL)) NOT VALID`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" DROP CONSTRAINT "chk_contents_partner_disclosure"`,
    );
    // NULL이 이미 들어간 행이 있으면 되돌릴 수 없다 — 개발 단계 한정의 단순 복원이다
    await queryRunner.query(
      `ALTER TABLE "contents" ALTER COLUMN "source_url" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ALTER COLUMN "author_name" SET NOT NULL`,
    );
  }
}
