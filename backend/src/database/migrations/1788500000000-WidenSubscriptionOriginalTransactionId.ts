import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 8.2 — `subscriptions.original_transaction_id`를 넓힌다(255 → 2048).
 *
 * Google Play에는 App Store의 `originalTransactionId`가 없어 **그 구독의 최초 구매 토큰**을 이 컬럼에 쓴다
 * (`subscription-api.md` 4.7). App Store ID는 십수 자리 숫자지만 Play 구매 토큰은 수백 자이고 형식이 바뀔 수
 * 있다 — 255자를 넘으면 "결제는 됐는데 저장이 실패"한다. 길이만 늘리는 변경이라 기존 값·유니크 제약은 그대로다.
 *
 * 탈퇴 시 이 값을 옮겨 담는 `archive.archived_subscriptions`(domain.md 11.5 — `archive` 스키마)도 같이 넓힌다 — 한쪽만 넓히면
 * Play 구독자의 탈퇴가 아카이브 단계에서 실패한다.
 */
export class WidenSubscriptionOriginalTransactionId1788500000000 implements MigrationInterface {
  name = 'WidenSubscriptionOriginalTransactionId1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ALTER COLUMN "original_transaction_id" TYPE character varying(2048)`,
    );
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_subscriptions" ALTER COLUMN "original_transaction_id" TYPE character varying(2048)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_subscriptions" ALTER COLUMN "original_transaction_id" TYPE character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ALTER COLUMN "original_transaction_id" TYPE character varying(255)`,
    );
  }
}
