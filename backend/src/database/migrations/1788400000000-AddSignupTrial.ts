import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 가입 체험(`subscription.md` 4.8) — 신규 가입자에게 일정 기간 무제한 청취.
 *
 * - `users.trial_ends_at` — 체험 종료 시각. 가입 때 한 번 쓴다. 기존 사용자는 `NULL`(체험 없음)이라
 *   컬럼 추가만으로 기존 판정이 바뀌지 않는다.
 * - `plans`의 `trial` 행 — 체험 중의 정책값(무제한). **판매하지 않으므로 `is_active = false`** — 요금제 목록
 *   (`GET /plans`)과 "더 높은 요금제가 있는가" 판정에 끼지 않는다. 드립 편수는 전 티어와 같다.
 *   한도를 코드 상수가 아니라 행에 두는 이유는 다른 티어와 같다 — 배포 없이 조정한다(domain.md 8.1).
 */
export class AddSignupTrial1788400000000 implements MigrationInterface {
  name = 'AddSignupTrial1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "trial_ends_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `INSERT INTO "plans" ("tier", "name", "description", "daily_play_limit", "daily_drip_count", "daily_discovery_count", "is_drip_enabled", "is_ads_enabled", "price_krw", "display_order", "is_active")
       VALUES ('trial', '무료 체험', '가입 후 체험 기간 동안 제한 없이 들을 수 있어요', NULL, 2, 1, true, true, 0, 0, false)
       ON CONFLICT ON CONSTRAINT "uq_plans_tier" DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "plans" WHERE "tier" = 'trial'`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "trial_ends_at"`);
  }
}
