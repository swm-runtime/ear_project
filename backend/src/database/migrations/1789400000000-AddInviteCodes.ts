import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 초대 코드(domain.md 8.5·8.6, 2026-10-10) — PoC·제휴 대상에게 앱에서 코드를 입력받아 유료 요금제를 기간 한정으로 지급한다.
 *
 * - `invite_codes` — 코드 하나가 캠페인 하나. 지급 기간은 일수(`grant_days`)나 마지막 날(`grant_until_date`) 중
 *   정확히 하나(CHECK). 지급 요금제는 유료 티어만(CHECK).
 * - `invite_code_redemptions` — 사용 기록이자 지급 기간. 같은 코드는 계정당 한 번(UNIQUE). 탈퇴 시 CASCADE.
 *   만료 배치가 찾는 "끝났는데 캐시를 아직 안 맞춘 행"은 부분 인덱스로 받는다. `subscribed_at_start`는 입력 때 유료 구독이
 *   살아 있었는지 — 없었는데 나중에 생기면 "이벤트 중 결제"로 보고 지급을 끝낸다.
 */
export class AddInviteCodes1789400000000 implements MigrationInterface {
  name = 'AddInviteCodes1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invite_codes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(32) NOT NULL,
        "name" varchar(100) NOT NULL,
        "tier" varchar(20) NOT NULL,
        "grant_days" int,
        "grant_until_date" date,
        "max_redemptions" int,
        "redeemed_count" int NOT NULL DEFAULT 0,
        "redeemable_from" TIMESTAMP WITH TIME ZONE,
        "redeemable_until" TIMESTAMP WITH TIME ZONE,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_invite_codes" PRIMARY KEY ("id"),
        CONSTRAINT "ck_invite_codes_tier" CHECK ("tier" IN ('daily', 'pro')),
        CONSTRAINT "ck_invite_codes_grant_period" CHECK (("grant_days" IS NULL) <> ("grant_until_date" IS NULL)),
        CONSTRAINT "ck_invite_codes_grant_days" CHECK ("grant_days" IS NULL OR "grant_days" >= 1),
        CONSTRAINT "ck_invite_codes_max_redemptions" CHECK ("max_redemptions" IS NULL OR "max_redemptions" >= 1)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_invite_codes_code" ON "invite_codes" ("code")`,
    );
    await queryRunner.query(`
      CREATE TABLE "invite_code_redemptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "invite_code_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "tier" varchar(20) NOT NULL,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "tier_released_at" TIMESTAMP WITH TIME ZONE,
        "subscribed_at_start" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_invite_code_redemptions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_invite_code_redemptions_invite_codes" FOREIGN KEY ("invite_code_id") REFERENCES "invite_codes"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_invite_code_redemptions_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_invite_code_redemptions_code_user" ON "invite_code_redemptions" ("invite_code_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_invite_code_redemptions_user_id_ends_at" ON "invite_code_redemptions" ("user_id", "ends_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_invite_code_redemptions_unreleased_ends_at" ON "invite_code_redemptions" ("ends_at") WHERE "tier_released_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invite_code_redemptions"`);
    await queryRunner.query(`DROP TABLE "invite_codes"`);
  }
}
