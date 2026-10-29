import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 후기 참여 프로모션(KAN-279 — `content-review.md` 4.4 · 4.5, domain.md 8.5 · 8.7).
 *
 * - `promotions`: 끝까지 들은 편 3개에 글 있는 후기를 남긴 계정에 **한 번** 발급하는 보관형 보상(Pro 7일). `(user_id, kind)`
 *   유니크가 계정당 1회 · 동시 발급 1장을 막는다. 소멸은 컬럼이 아니라 `expires_at` 판정이다. 사용하면 지급 행
 *   (`invite_code_redemptions`)을 가리킨다(SET NULL — 지급 행이 탈퇴로 지워져도 이 행도 함께 CASCADE 로 지워진다).
 * - 내부 캠페인 행 `REVIEW-REWARD`(8.5): 사용으로 생기는 지급이 가리키는 코드 행. **`is_active = false`** — 코드 입력 경로는
 *   `is_active`와 무관하게 이 코드를 없는 코드로 본다(서버 코드). 이미 있으면 건드리지 않는다.
 */
export class AddPromotions1792000000000 implements MigrationInterface {
  name = 'AddPromotions1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "promotions" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "user_id" uuid NOT NULL,
         "kind" character varying(30) NOT NULL,
         "tier" character varying(20) NOT NULL,
         "grant_days" integer NOT NULL,
         "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "redeemed_at" TIMESTAMP WITH TIME ZONE,
         "invite_code_redemption_id" uuid,
         CONSTRAINT "pk_promotions" PRIMARY KEY ("id"),
         CONSTRAINT "uq_promotions_user_id_kind" UNIQUE ("user_id", "kind"),
         CONSTRAINT "ck_promotions_grant_days" CHECK ("grant_days" >= 1),
         CONSTRAINT "ck_promotions_tier" CHECK ("tier" IN ('daily', 'pro')),
         CONSTRAINT "fk_promotions_users"
           FOREIGN KEY ("user_id") REFERENCES "users"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION,
         CONSTRAINT "fk_promotions_invite_code_redemptions"
           FOREIGN KEY ("invite_code_redemption_id") REFERENCES "invite_code_redemptions"("id")
           ON DELETE SET NULL ON UPDATE NO ACTION
       )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_promotions_invite_code_redemption_id" ON "promotions" ("invite_code_redemption_id") WHERE "invite_code_redemption_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `INSERT INTO "invite_codes" ("code", "name", "tier", "grant_days", "grant_until_date", "max_redemptions", "redeemable_from", "redeemable_until", "is_active")
       VALUES ('REVIEW-REWARD', '후기 참여', 'pro', 7, NULL, NULL, NULL, NULL, false)
       ON CONFLICT ("code") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "uq_promotions_invite_code_redemption_id"`,
    );
    await queryRunner.query(`DROP TABLE "promotions"`);
    // 이미 쓴 지급(RESTRICT)이 있으면 코드 행을 남긴다 — 지급 기록을 지우면서까지 되돌리지 않는다
    await queryRunner.query(
      `DELETE FROM "invite_codes" code
        WHERE code."code" = 'REVIEW-REWARD'
          AND NOT EXISTS (
            SELECT 1 FROM "invite_code_redemptions" redemption
             WHERE redemption."invite_code_id" = code."id"
          )`,
    );
  }
}
