import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `purchase_intents`(domain.md 8.3) · `store_notification_logs`(8.4) — 구독 영수증 검증(KAN-40)의
 * 선행 스키마. 두 테이블 모두 domain.md에 정의만 있고 만들지 않은 상태였다.
 *
 * - `purchase_intents.user_id`는 **ON DELETE CASCADE** — 12.3 즉시 파기 목록이다. 결제 결과는
 *   `subscriptions`에 남으므로 멱등키 행은 아카이브하지 않는다.
 * - `purchase_intents.plan_id`는 CASCADE를 걸지 않는다 — 요금제는 비활성화(`is_active=false`)할 뿐
 *   지우지 않는다(`subscription.md` 7).
 * - `store_notification_logs`는 `(store, notification_id)` 유니크로 같은 알림의 중복 처리를 막는다.
 */
export class AddPurchaseIntentsAndStoreNotificationLogs1787800000000 implements MigrationInterface {
  name = 'AddPurchaseIntentsAndStoreNotificationLogs1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "purchase_intents" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "user_id" uuid NOT NULL,
         "plan_id" uuid NOT NULL,
         "platform" character varying(20) NOT NULL,
         "status" character varying(20) NOT NULL,
         CONSTRAINT "pk_purchase_intents" PRIMARY KEY ("id"),
         CONSTRAINT "fk_purchase_intents_users"
           FOREIGN KEY ("user_id") REFERENCES "users"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION,
         CONSTRAINT "fk_purchase_intents_plans"
           FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
           ON DELETE NO ACTION ON UPDATE NO ACTION
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_purchase_intents_user_id_created_at" ON "purchase_intents" ("user_id", "created_at" DESC)`,
    );

    await queryRunner.query(
      `CREATE TABLE "store_notification_logs" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" BIGSERIAL NOT NULL,
         "store" character varying(20) NOT NULL,
         "notification_id" character varying(255) NOT NULL,
         "type" character varying(100) NOT NULL,
         "payload" jsonb NOT NULL,
         "processed_at" TIMESTAMP WITH TIME ZONE,
         CONSTRAINT "pk_store_notification_logs" PRIMARY KEY ("id"),
         CONSTRAINT "uq_store_notification_logs_store_notification_id" UNIQUE ("store", "notification_id")
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "store_notification_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_purchase_intents_user_id_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "purchase_intents"`);
  }
}
