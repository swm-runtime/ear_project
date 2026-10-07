import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `subscriptions.latest_order_id` — 마지막으로 반영한 Play 주문 ID(domain.md 8.2, 2026-10-07).
 * 환불로 끝난 Play 구독을 "같은 구매 토큰·같은 주문"의 조회 결과로 되살리지 않는 판정의 결제 주기 식별자다
 * (`subscription-api.md` 4.7 "환불의 고정"). Google은 갱신·재청구 성공마다 새 주문 ID를 발급한다.
 * 기존 행은 NULL — 모르는 행은 종전 규칙(만료 시각 비교)으로 판정한다. App Store 행은 늘 NULL이다.
 */
export class AddSubscriptionLatestOrderId1789200000000 implements MigrationInterface {
  name = 'AddSubscriptionLatestOrderId1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD COLUMN "latest_order_id" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN "latest_order_id"`,
    );
  }
}
