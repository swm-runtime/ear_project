import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `archived_subscriptions`의 유니크를 `original_transaction_id` 단독에서
 * **`(user_hash, original_transaction_id)`** 조합으로 좁힌다(결정 2026-09-09).
 *
 * ## 왜 바꾸는가 — 탈퇴가 막혀 있었다
 *
 * 유료 사용자가 탈퇴 → 재가입(구독 복원) → **다시 탈퇴**하면 같은
 * `original_transaction_id`를 아카이브에 두 번 넣게 되어 유니크 위반이 난다. 예외가
 * 탈퇴 트랜잭션 안에서 터지므로 전체가 롤백되고 사용자는 500을 받는다 — 다시 눌러도 같다.
 *
 * **그 사용자는 구조적으로 탈퇴할 수 없다.** 개인정보보호법 제21조 제1항의 파기 의무를
 * 제품이 이행하지 못하는 상태다.
 *
 * ## "한 구독 = 한 계정"은 유지된다
 *
 * 그 보장의 **실제 집행자는 `uq_subscriptions_original_transaction_id`다**(domain.md 8.2).
 * 살아 있는 계정끼리 같은 스토어 구독을 가질 수 없다는 뜻이며, 그 제약은 그대로 둔다.
 *
 * 아카이브 쪽 유니크가 추가로 하던 일은 **이력까지 하나로 막는 것**이었는데, 그것이
 * 위 사고의 원인이다. 아카이브는 권한 테이블이 아니라 **보존 기록**이므로 계정마다 한 줄씩
 * 남는 편이 법적으로도 맞다 — 보존 의무는 계정별 거래에 성립한다.
 *
 * ## 이 변경으로 열리는 구멍과 그 막는 자리
 *
 * 탈퇴한 계정의 `subscriptions` 행은 삭제되므로, 그 `original_transaction_id`는 다시
 * 자유로워진다. 종전에는 아카이브 유니크가 그것을 막았다. 앞으로는 **영수증 검증 시점**에
 * 막아야 한다 — 스토어가 그 구매의 소유자를 인증하므로 그 지점이 옳은 자리다
 * (`tickets/backend/pending/subscription-receipt-verification.md`에 요건으로 적었다).
 */
export class ScopeArchivedSubscriptionUnique1786800000000 implements MigrationInterface {
  name = 'ScopeArchivedSubscriptionUnique1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_subscriptions"
         DROP CONSTRAINT "uq_archived_subscriptions_original_transaction_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_subscriptions"
         ADD CONSTRAINT "uq_archived_subscriptions_user_hash_original_transaction_id"
         UNIQUE ("user_hash", "original_transaction_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_subscriptions"
         DROP CONSTRAINT "uq_archived_subscriptions_user_hash_original_transaction_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archive"."archived_subscriptions"
         ADD CONSTRAINT "uq_archived_subscriptions_original_transaction_id"
         UNIQUE ("original_transaction_id")`,
    );
  }
}
