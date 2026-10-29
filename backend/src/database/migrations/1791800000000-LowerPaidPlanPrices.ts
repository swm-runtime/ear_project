import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 단기 실험 ① 구독 가격 인하(KAN-286, 2026-10-29) — `plans.price_krw` 를 데일리 3,900 → 1,900원,
 * 프로 9,900 → 3,900원으로 맞춘다. 기존 구독자 포함 전원 대상이다.
 *
 * 실제 결제 가격은 스토어 콘솔(App Store Connect · Play Console)이 정하고 앱은 스토어 `displayPrice` 를
 * 그린다 — 이 값은 서버 참고값이다(`features/subscription.md`). 스토어 가격 변경은 사람 손 작업이라 이
 * 마이그레이션과 별개로 같은 시기에 한다. `name`·`description` 에는 가격 문구가 없어 건드리지 않는다.
 *
 * `down` 은 확정 당시 값(2026-10-02, `1788300100000-SeedPaidPlans`)으로 되돌린다.
 */
export class LowerPaidPlanPrices1791800000000 implements MigrationInterface {
  name = 'LowerPaidPlanPrices1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "plans" SET "price_krw" = 1900 WHERE "tier" = 'daily'`,
    );
    await queryRunner.query(
      `UPDATE "plans" SET "price_krw" = 3900 WHERE "tier" = 'pro'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "plans" SET "price_krw" = 3900 WHERE "tier" = 'daily'`,
    );
    await queryRunner.query(
      `UPDATE "plans" SET "price_krw" = 9900 WHERE "tier" = 'pro'`,
    );
  }
}
