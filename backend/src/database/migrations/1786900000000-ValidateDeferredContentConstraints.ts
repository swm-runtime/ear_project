import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `NOT VALID`로 붙여 둔 `contents` 제약 2개를 잠근다.
 *
 * - `chk_contents_partner_disclosure` (`1786300100000-AllowNullContentsDisclosure`) — 파트너
 *   콘텐츠의 공시 필드 필수 CHECK. 시드 DB의 기존 행 때문에 즉시 검증을 미뤘다.
 * - `fk_contents_partners` (`1786700000000-AddMissingDomainTables`) — `partners`에 없는
 *   `partner_id`가 남아 있을 수 있어 미뤘다.
 *
 * 두 마이그레이션 모두 주석으로 "후속 VALIDATE"를 약속했으나 실행되지 않았다(2026-09-09 감사).
 * `NOT VALID` 상태에서도 신규 행에는 강제되지만 기존 행의 무결성은 보장되지 않았다.
 *
 * `VALIDATE CONSTRAINT`는 테이블에 SHARE UPDATE EXCLUSIVE 잠금만 잡아 쓰기를 막지 않는다.
 * **위반 행이 남아 있으면 이 마이그레이션이 실패한다** — 그것이 의도다(조용히 넘기면 제약의
 * 의미가 없다). 실패하면 운영 데이터를 먼저 정리한다:
 *   partner 행의 author_name·source_url·partner_id·license_expires_at 누락,
 *   또는 `partners`에 없는 `partner_id`.
 * 운영 DB에는 파트너 콘텐츠가 아직 없어(2026-09-09) 즉시 통과가 예상된다.
 */
export class ValidateDeferredContentConstraints1786900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" VALIDATE CONSTRAINT "chk_contents_partner_disclosure"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" VALIDATE CONSTRAINT "fk_contents_partners"`,
    );
  }

  public async down(): Promise<void> {
    // VALIDATE는 되돌릴 대상이 없다 — 제약을 다시 NOT VALID로 풀 수는 없고(DROP 후 재추가만
    // 가능) 그럴 이유도 없다. 원 마이그레이션의 down이 제약 자체를 지운다.
  }
}
