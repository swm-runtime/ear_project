import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthTables1785845027168 implements MigrationInterface {
  name = 'CreateAuthTables1785845027168';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid PK 기본값(uuid_generate_v4)과 보존 아카이브 스키마는 테이블보다 먼저 있어야 한다
    // (domain.md 11장 — 아카이브는 운영 테이블과 분리된 스키마에 둔다)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "archive"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" character varying(20) NOT NULL, "provider_user_id" character varying(255) NOT NULL, "email" character varying(320), "is_email_verified" boolean NOT NULL DEFAULT false, "nickname" character varying(50) NOT NULL, "role" character varying(20) NOT NULL DEFAULT 'user', "tier" character varying(20) NOT NULL DEFAULT 'light', "status" character varying(20) NOT NULL DEFAULT 'active', "onboarding_completed" boolean NOT NULL DEFAULT false, "onboarding_step" character varying(20) NOT NULL DEFAULT 'topic', "onboarding_completed_at" TIMESTAMP WITH TIME ZONE, "job_category" character varying(100), "job_title" character varying(100), "years_of_experience" integer, "withdrawn_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_users_provider_provider_user_id" UNIQUE ("provider", "provider_user_id"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_status" ON "users"  ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "refresh_token_hash" character varying(128) NOT NULL, "device_id" character varying(200) NOT NULL, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_refresh_token_hash" ON "sessions"  ("refresh_token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_user_id" ON "sessions"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "subscriptions" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "tier" character varying(20) NOT NULL, "store" character varying(20) NOT NULL, "original_transaction_id" character varying(255) NOT NULL, "latest_receipt" text NOT NULL, "status" character varying(20) NOT NULL, "is_auto_renew" boolean NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "cancelled_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_subscriptions_original_transaction_id" UNIQUE ("original_transaction_id"), CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_subscriptions_user_id_status" ON "subscriptions"  ("user_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "archive"."archived_consents" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_hash" character varying(128) NOT NULL, "user_hash_version" smallint NOT NULL DEFAULT '1', "consent_type" character varying(20) NOT NULL, "version" character varying(20), "is_agreed" boolean NOT NULL, "agreed_at" TIMESTAMP WITH TIME ZONE NOT NULL, "archived_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_f1eb5b54d122c4c6754472b7919" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_archived_consents_archived_at" ON "archive"."archived_consents"  ("archived_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_archived_consents_user_hash" ON "archive"."archived_consents"  ("user_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "archive"."archived_subscriptions" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_hash" character varying(128) NOT NULL, "user_hash_version" smallint NOT NULL DEFAULT '1', "original_transaction_id" character varying(255) NOT NULL, "store" character varying(20) NOT NULL, "tier" character varying(20) NOT NULL, "status" character varying(20) NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "cancelled_at" TIMESTAMP WITH TIME ZONE, "archived_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_archived_subscriptions_original_transaction_id" UNIQUE ("original_transaction_id"), CONSTRAINT "PK_7308323b0c01f434e4a4afe9a6d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_archived_subscriptions_archived_at" ON "archive"."archived_subscriptions"  ("archived_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_archived_subscriptions_user_hash" ON "archive"."archived_subscriptions"  ("user_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "archive"."archived_users" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_hash" character varying(128) NOT NULL, "user_hash_version" smallint NOT NULL DEFAULT '1', "email" character varying(320) NOT NULL, "provider" character varying(20) NOT NULL, "provider_user_id" character varying(255) NOT NULL, "tier" character varying(20) NOT NULL, "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL, "withdrawn_at" TIMESTAMP WITH TIME ZONE NOT NULL, "archived_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_archived_users_user_hash" UNIQUE ("user_hash"), CONSTRAINT "PK_17c822b32ab92ee6e08938a9a01" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_archived_users_archived_at" ON "archive"."archived_users"  ("archived_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_archived_users_email" ON "archive"."archived_users"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "consents" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "consent_type" character varying(20) NOT NULL, "version" character varying(20), "is_agreed" boolean NOT NULL, "agreed_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_9efc68eb6aba7d638fb6ea034dd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_consents_user_id_consent_type_agreed_at" ON "consents"  ("user_id", "consent_type", "agreed_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "email_verifications" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" BIGSERIAL NOT NULL, "user_id" uuid NOT NULL, "email" character varying(320) NOT NULL, "code_hash" character varying(128) NOT NULL, "send_seq" smallint NOT NULL, "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "attempt_count" smallint NOT NULL DEFAULT '0', "last_attempted_at" TIMESTAMP WITH TIME ZONE, "verified_at" TIMESTAMP WITH TIME ZONE, "invalidated_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_email_verifications_user_id_email_send_seq_sent_at" UNIQUE ("user_id", "email", "send_seq", "sent_at"), CONSTRAINT "PK_c1ea2921e767f83cd44c0af203f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_email_verifications_expires_at" ON "email_verifications"  ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_email_verifications_user_id_email_sent_at" ON "email_verifications"  ("user_id", "email", "sent_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "withdrawal_logs" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" BIGSERIAL NOT NULL, "user_hash" character varying(128) NOT NULL, "user_hash_version" smallint NOT NULL DEFAULT '1', "reason_code" character varying(50), "reason_text" text, "withdrawn_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_dc036fafce67dd354cb8c3827d2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "fk_subscriptions_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "consents" ADD CONSTRAINT "fk_consents_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_verifications" ADD CONSTRAINT "fk_email_verifications_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_verifications" DROP CONSTRAINT "fk_email_verifications_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consents" DROP CONSTRAINT "fk_consents_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP CONSTRAINT "fk_subscriptions_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "fk_sessions_users"`,
    );
    await queryRunner.query(`DROP TABLE "withdrawal_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_email_verifications_user_id_email_sent_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_email_verifications_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "email_verifications"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_consents_user_id_consent_type_agreed_at"`,
    );
    await queryRunner.query(`DROP TABLE "consents"`);
    await queryRunner.query(`DROP INDEX "archive"."idx_archived_users_email"`);
    await queryRunner.query(
      `DROP INDEX "archive"."idx_archived_users_archived_at"`,
    );
    await queryRunner.query(`DROP TABLE "archive"."archived_users"`);
    await queryRunner.query(
      `DROP INDEX "archive"."idx_archived_subscriptions_user_hash"`,
    );
    await queryRunner.query(
      `DROP INDEX "archive"."idx_archived_subscriptions_archived_at"`,
    );
    await queryRunner.query(`DROP TABLE "archive"."archived_subscriptions"`);
    await queryRunner.query(
      `DROP INDEX "archive"."idx_archived_consents_user_hash"`,
    );
    await queryRunner.query(
      `DROP INDEX "archive"."idx_archived_consents_archived_at"`,
    );
    await queryRunner.query(`DROP TABLE "archive"."archived_consents"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_subscriptions_user_id_status"`,
    );
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_user_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_sessions_refresh_token_hash"`,
    );
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP INDEX "public"."idx_users_status"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "archive" CASCADE`);
  }
}
