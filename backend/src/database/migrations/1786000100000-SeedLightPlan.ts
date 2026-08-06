import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 8.1 — **`plans`에는 `light` 행이 존재한다.** 무료 정책(하루 재생 2편, 드립 2편)을
 * 코드 상수가 아니라 데이터로 표현하기 위해서다.
 *
 * 목 데이터 시드가 아니라 마이그레이션인 이유: 이 행이 없으면 `paywall.md` 4.1의 재생 한도
 * 판정이 성립하지 않는다. 한도를 읽을 곳이 없는 서버는 페이월을 띄울 수 없으므로,
 * 모든 환경에 반드시 존재해야 하는 **정책 데이터**다.
 *
 * `daily` · `pro` 행은 아직 만들지 않는다 — 드립 편수는 2편으로 확정됐지만 `price_krw`와
 * `daily_play_limit`이 미정이라 행을 완성할 수 없다(domain.md 8.1). subscription 모듈에서
 * 함께 넣는다.
 *
 * `name` · `description` · `display_order`는 domain.md가 값을 정하지 않은 표시용 필드다.
 * 페이월 시트의 확정 카피가 나오면 그때 갱신한다.
 */
export class SeedLightPlan1786000100000 implements MigrationInterface {
  name = 'SeedLightPlan1786000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 이미 넣어 둔 환경에서도 그대로 통과해야 한다 — 유니크 위반을 실패로 만들지 않는다
    await queryRunner.query(
      `INSERT INTO "plans" ("tier", "name", "description", "daily_play_limit", "daily_drip_count", "is_drip_enabled", "is_ads_enabled", "price_krw", "display_order", "is_active")
       VALUES ('light', '라이트', '무료로 하루 2편까지 들을 수 있어요', 2, 2, true, true, 0, 1, true)
       ON CONFLICT ON CONSTRAINT "uq_plans_tier" DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "plans" WHERE "tier" = 'light'`);
  }
}
