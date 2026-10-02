import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 8.1 — 유료 요금제 두 행(`daily` · `pro`). 값이 확정됐다(2026-10-02): 데일리 3,900원·하루 5편,
 * 프로 9,900원·무제한. 둘 다 광고가 없다.
 *
 * `SeedLightPlan`과 같은 이유로 마이그레이션이다 — 이 행이 없으면 유료 티어의 재생 한도를 읽을 곳이 없어
 * `light` 값으로 내려 판정한다(`PlanService.getPlayLimitPolicy`). 모든 환경에 있어야 하는 정책 데이터다.
 *
 * 이미 손으로 넣어 둔 환경(개발계 시험)이 있을 수 있어 충돌 시 **문서 값으로 맞춘다** — 정책의 기준은
 * domain.md이고, 환경마다 다른 값이 남으면 같은 티어가 다르게 동작한다. `name`·`description`은 표시 문구라
 * 기존 값을 보존한다(운영이 DB에서 고친 카피를 되돌리지 않는다).
 *
 * `store_product_id_android`는 비운다 — Play 구현 전이라 그 플랫폼의 결제 의도는
 * `SUBSCRIPTION_PLAN_UNAVAILABLE`로 막힌다(`subscription-api.md` 1장).
 */
export class SeedPaidPlans1788300100000 implements MigrationInterface {
  name = 'SeedPaidPlans1788300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "plans" ("tier", "name", "description", "daily_play_limit", "daily_drip_count", "daily_discovery_count", "is_drip_enabled", "is_ads_enabled", "price_krw", "store_product_id_ios", "store_product_id_android", "display_order", "is_active")
       VALUES
         ('daily', '데일리', '하루 5편까지 광고 없이 들을 수 있어요', 5, 2, 1, true, false, 3900, 'com.runtime.ear.subscription.daily.monthly', NULL, 2, true),
         ('pro', '프로', '제한 없이 마음껏 들을 수 있어요', NULL, 2, 1, true, false, 9900, 'com.runtime.ear.subscription.pro.monthly', NULL, 3, true)
       ON CONFLICT ON CONSTRAINT "uq_plans_tier" DO UPDATE SET
         "daily_play_limit" = EXCLUDED."daily_play_limit",
         "is_ads_enabled" = EXCLUDED."is_ads_enabled",
         "price_krw" = EXCLUDED."price_krw",
         "store_product_id_ios" = EXCLUDED."store_product_id_ios",
         "display_order" = EXCLUDED."display_order"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 구독 행이 이 요금제를 가리키지는 않지만(`subscriptions.tier`는 값 복사) 결제 의도는 FK로 묶인다 —
    // 의도 행이 있으면 실패한다. 되돌릴 때는 의도를 먼저 정리한다
    await queryRunner.query(
      `DELETE FROM "plans" WHERE "tier" IN ('daily', 'pro')`,
    );
  }
}
