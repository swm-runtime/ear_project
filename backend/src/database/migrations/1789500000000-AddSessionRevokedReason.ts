import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `sessions.revoked_reason`(domain.md 3.3, 2026-10-10 — KAN-167) — 세션이 왜 폐기됐는지.
 *
 * 갱신은 폐기된 토큰이 오면 사유를 묻지 않고 "회전 토큰 재사용"(REUSED → 사용자 세션 전체 폐기)으로
 * 판정했다. 로그아웃도 `revoked_at`을 찍으므로 로그아웃 직후 자동 갱신 한 번이 다른 기기까지 로그아웃시켰다.
 * 사유를 남겨 **회전(`rotated`)된 토큰만** 탈취로 본다.
 *
 * - 값: `rotated` | `logout` | `reuse_detected`. varchar + TypeScript enum(`SessionRevokedReason`) — DB enum·CHECK를
 *   두지 않는다(convention.md 4.2: 값 추가 때 마이그레이션 비용).
 * - **기존 행은 채우지 않는다(NULL).** 옛 폐기 행의 사유는 알 수 없고, 갱신은 NULL을 종전대로 회전으로 본다 —
 *   이 마이그레이션이 옛 행의 판정을 바꾸지 않는다. 폐기 행은 30일 뒤 삭제되므로(domain.md 12.1) NULL 폐기 행은 저절로 사라진다.
 */
export class AddSessionRevokedReason1789500000000 implements MigrationInterface {
  name = 'AddSessionRevokedReason1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN "revoked_reason" varchar(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP COLUMN "revoked_reason"`,
    );
  }
}
