import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `consents.consent_type` · `archive.archived_consents.consent_type` 20 → 32자 (domain.md 3.2·11.4, 2026-10-16 — KAN-215).
 *
 * 국외 이전 동의 `cross_border_transfer`가 21자라 종전 길이에 들어가지 않는다. 탈퇴 아카이브는 `consents` 행을 그대로
 * 옮기므로 같이 넓힌다. 길이만 늘리는 변경이라 PostgreSQL은 테이블·인덱스를 다시 쓰지 않는다.
 */
export class WidenConsentType1790300000000 implements MigrationInterface {
  name = 'WidenConsentType1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "consents" ALTER COLUMN "consent_type" TYPE character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_consents" ALTER COLUMN "consent_type" TYPE character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 동의 이력은 법적 입증 자료라 되돌리기 위해 지우지 않는다 — 20자를 넘는 값(국외 이전 동의)이 남아 있으면 멈춘다
    const rows = (await queryRunner.query(
      `SELECT (SELECT count(*) FROM "consents" WHERE length("consent_type") > 20)
            + (SELECT count(*) FROM "archive"."archived_consents" WHERE length("consent_type") > 20) AS count`,
    )) as { count: string }[];
    if (Number(rows[0].count) > 0) {
      throw new Error(
        'consent_type longer than 20 exists — cannot shrink without deleting consent records',
      );
    }
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_consents" ALTER COLUMN "consent_type" TYPE character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "consents" ALTER COLUMN "consent_type" TYPE character varying(20)`,
    );
  }
}
