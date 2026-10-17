import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `withdrawal_logs.market` (domain.md 3.4, 2026-10-17).
 *
 * 일일 이탈 보고를 시장별(KR·GLOBAL)로 나누고, 해외 전용 탈퇴 사유를 둘 수 있게 탈퇴 당시 사용자의 시장을 남긴다. 값이 둘뿐이라
 * 사람을 가리키지 않는다.
 *
 * 기존 행은 `kr`로 채운다(DEFAULT). 운영은 GLOBAL 가입이 열린 적이 없어 지금까지의 탈퇴가 전부 KR 이다. 개발계에는 GLOBAL
 * 시험 계정의 탈퇴가 있었다면 KR 로 잘못 들어간다 — 개발계 지표라 감수한다.
 */
export class AddWithdrawalLogMarket1790600000000 implements MigrationInterface {
  name = 'AddWithdrawalLogMarket1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "withdrawal_logs" ADD "market" character varying(10) NOT NULL DEFAULT 'kr'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "withdrawal_logs" DROP COLUMN "market"`,
    );
  }
}
