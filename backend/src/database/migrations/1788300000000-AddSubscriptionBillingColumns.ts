import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 8.2 — 인앱 결제 반영(KAN-106 · KAN-40)에 필요한 `subscriptions` 컬럼 셋.
 *
 * - `pending_tier`: 다운그레이드 예약(다음 갱신 때 바뀔 티어). 화면의 "N월 N일부터 데일리" 근거
 * - `environment`: 실결제(`production`)와 스토어 시험 결제(`sandbox`)의 구분. 운영 서버도 심사·TestFlight의
 *   샌드박스 거래를 받으므로, 남기지 않으면 시험 결제가 매출·구독자 수에 섞인다. 기존 행은 없다(무료만 있었다)
 * - `last_notified_at`: 마지막으로 반영한 스토어 알림의 서명 시각 — 순서가 뒤바뀐 옛 알림이 상태를 덮지 못하게 한다
 */
export class AddSubscriptionBillingColumns1788300000000 implements MigrationInterface {
  name = 'AddSubscriptionBillingColumns1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD "pending_tier" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD "environment" character varying(20) NOT NULL DEFAULT 'production'`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD "last_notified_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN "last_notified_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN "environment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN "pending_tier"`,
    );
  }
}
