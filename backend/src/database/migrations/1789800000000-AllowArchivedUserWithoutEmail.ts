import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `archive.archived_users.email` NOT NULL 해제 (2026-10-11 감사 — domain.md 11.3).
 *
 * 결제 이력이 있는 탈퇴자는 아카이브에 거래 주체 식별 정보를 남기는데, 이메일이 필수라 이메일 없이 결제 이력이 생긴
 * 계정(탈퇴 후 이메일 없이 재가입 → 해지 안 된 스토어 구독의 갱신 거래가 앱 제출로 연결)은 탈퇴가 매번 500 이었다.
 * 재시도해도 같아 파기 요구를 들어줄 수 없었다. 그런 계정은 `provider` + `provider_user_id`(NOT NULL 그대로)로
 * 식별하고 `email`은 `null`로 둔다. 기존 행은 전부 값이 있어 바뀌지 않는다.
 */
export class AllowArchivedUserWithoutEmail1789800000000 implements MigrationInterface {
  name = 'AllowArchivedUserWithoutEmail1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_users" ALTER COLUMN "email" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 되돌리기 전에 이메일 없는 아카이브 행이 있으면 실패한다 — 그 행을 지우면 보존 의무를 어긴다
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_users" ALTER COLUMN "email" SET NOT NULL`,
    );
  }
}
