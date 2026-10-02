import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 8.1 — 유료 요금제(`daily` · `pro`)를 **판매 중**으로 맞춘다.
 *
 * `SeedPaidPlans`(1788300100000)는 행이 이미 있으면 가격·한도·상품 ID만 문서 값으로 맞추고 `is_active`는
 * 건드리지 않았다. 그런데 개발계에는 2026-09-16에 넣어 둔 `pro` 행이 판매 중지(`is_active = false`)로 남아 있어,
 * 배포 뒤에도 요금제 목록에 프로가 없고 프로 결제 의도가 `SUBSCRIPTION_PLAN_UNAVAILABLE`로 막혔다(2026-10-02).
 *
 * 값이 확정돼 팔기 시작하는 시점이므로 두 요금제는 어느 환경에서든 판매 중이어야 한다 — 환경마다 다르면
 * 같은 빌드가 개발계와 운영에서 다른 요금제를 보여 준다. 이후 운영이 판매를 멈출 때는 DB에서 끄며,
 * 이 마이그레이션은 한 번만 돌므로 그 결정을 되돌리지 않는다.
 */
export class ActivatePaidPlans1788300200000 implements MigrationInterface {
  name = 'ActivatePaidPlans1788300200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "plans" SET "is_active" = true WHERE "tier" IN ('daily', 'pro') AND "is_active" = false`,
    );
  }

  public async down(): Promise<void> {
    // 되돌릴 것이 없다 — 이전에 어느 행이 꺼져 있었는지는 환경마다 달랐고, 그 상태가 결함이었다
  }
}
