import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingTables1785912168342 implements MigrationInterface {
  name = 'AddOnboardingTables1785912168342';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "contents" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(255) NOT NULL, "description" text NOT NULL, "author_name" character varying(100) NOT NULL, "source_name" character varying(100) NOT NULL, "source_url" character varying(2048) NOT NULL, "origin" character varying(20) NOT NULL, "partner_id" uuid, "series_id" uuid, "episode_no" integer, "total_episodes" integer, "audio_path" character varying(512) NOT NULL, "duration_sec" integer NOT NULL, "thumbnail_url" character varying(2048) NOT NULL, "content_version" integer NOT NULL DEFAULT '1', "license_expires_at" TIMESTAMP WITH TIME ZONE, "status" character varying(20) NOT NULL, "published_at" TIMESTAMP WITH TIME ZONE NOT NULL, "withdrawn_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_b7c504072e537532d7080c54fac" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contents_partner_id" ON "contents"  ("partner_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contents_series_id_episode_no" ON "contents"  ("series_id", "episode_no") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contents_status_published_at" ON "contents"  ("status", "published_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "content_stats" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" BIGSERIAL NOT NULL, "content_id" uuid NOT NULL, "period_type" character varying(10) NOT NULL, "period_start" date NOT NULL, "play_count" integer NOT NULL DEFAULT '0', "complete_count" integer NOT NULL DEFAULT '0', "total_listen_sec" bigint NOT NULL DEFAULT '0', "save_count" integer NOT NULL DEFAULT '0', "source_link_click_count" integer NOT NULL DEFAULT '0', "is_final" boolean NOT NULL DEFAULT false, CONSTRAINT "uq_content_stats_content_id_period_type_period_start" UNIQUE ("content_id", "period_type", "period_start"), CONSTRAINT "PK_be2f8db4d1b6dd19b70497549b4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_content_stats_period_type_period_start_play_count" ON "content_stats"  ("period_type", "period_start", "play_count") `,
    );
    await queryRunner.query(
      `CREATE TABLE "topics" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "parent_category" character varying(100) NOT NULL, "is_visible" boolean NOT NULL DEFAULT true, "display_order" integer NOT NULL, CONSTRAINT "PK_e4aa99a3fa60ec3a37d1fc4e853" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_topics_is_visible_display_order" ON "topics"  ("is_visible", "display_order") `,
    );
    await queryRunner.query(
      `CREATE TABLE "content_topics" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "content_id" uuid NOT NULL, "topic_id" uuid NOT NULL, CONSTRAINT "uq_content_topics_content_id_topic_id" UNIQUE ("content_id", "topic_id"), CONSTRAINT "PK_64d8c4335f4630d39c22b4133a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_content_topics_topic_id" ON "content_topics"  ("topic_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "drip_excluded_contents" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "content_id" uuid NOT NULL, "reason" character varying(20) NOT NULL, "excluded_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_drip_excluded_contents_user_id_content_id" UNIQUE ("user_id", "content_id"), CONSTRAINT "PK_63180fd5f47a0eb009e6c38699b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_drip_excluded_contents_user_id" ON "drip_excluded_contents"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "first_drip_jobs" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "status" character varying(20) NOT NULL, "attempt_count" smallint NOT NULL DEFAULT '0', "last_attempted_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "item_count" integer NOT NULL DEFAULT '0', CONSTRAINT "uq_first_drip_jobs_user_id" UNIQUE ("user_id"), CONSTRAINT "PK_30e4ec4f7297f5e1c86be201f41" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_first_drip_jobs_status_last_attempted_at" ON "first_drip_jobs"  ("status", "last_attempted_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_interests" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "topic_id" uuid NOT NULL, "source" character varying(20) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "is_user_removed" boolean NOT NULL DEFAULT false, "deactivated_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_user_interests_user_id_topic_id" UNIQUE ("user_id", "topic_id"), CONSTRAINT "PK_cdfda991bb843bc8736cde962cc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_user_interests_user_id_is_active" ON "user_interests"  ("user_id", "is_active") `,
    );
    await queryRunner.query(
      `CREATE TABLE "library_items" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "content_id" uuid NOT NULL, "source" character varying(20) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'unplayed', "added_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_played_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_library_items_user_id_content_id" UNIQUE ("user_id", "content_id"), CONSTRAINT "PK_373853d99451df2762ce3a102c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_library_items_content_id" ON "library_items"  ("content_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_library_items_user_id_deleted_at_last_played_at" ON "library_items"  ("user_id", "deleted_at", "last_played_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_library_items_user_id_deleted_at_added_at_id" ON "library_items"  ("user_id", "deleted_at", "added_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "plans" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tier" character varying(20) NOT NULL, "name" character varying(50) NOT NULL, "description" text NOT NULL, "daily_play_limit" integer, "daily_drip_count" integer NOT NULL, "is_drip_enabled" boolean NOT NULL, "is_ads_enabled" boolean NOT NULL, "price_krw" integer NOT NULL, "store_product_id_ios" character varying(255), "store_product_id_android" character varying(255), "display_order" integer NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "uq_plans_tier" UNIQUE ("tier"), CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "device_tokens" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "device_id" character varying(255) NOT NULL, "token" character varying(512), "platform" character varying(20) NOT NULL, "is_os_permission_granted" boolean NOT NULL, "app_version" character varying(20) NOT NULL, "invalidated_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_device_tokens_user_id_device_id" UNIQUE ("user_id", "device_id"), CONSTRAINT "PK_84700be257607cfb1f9dc2e52c3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_device_tokens_user_id" ON "device_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "content_stats" ADD CONSTRAINT "fk_content_stats_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_topics" ADD CONSTRAINT "fk_content_topics_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_topics" ADD CONSTRAINT "fk_content_topics_topics" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "drip_excluded_contents" ADD CONSTRAINT "fk_drip_excluded_contents_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "drip_excluded_contents" ADD CONSTRAINT "fk_drip_excluded_contents_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "first_drip_jobs" ADD CONSTRAINT "fk_first_drip_jobs_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_interests" ADD CONSTRAINT "fk_user_interests_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_interests" ADD CONSTRAINT "fk_user_interests_topics" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "library_items" ADD CONSTRAINT "fk_library_items_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "library_items" ADD CONSTRAINT "fk_library_items_contents" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "device_tokens" ADD CONSTRAINT "fk_device_tokens_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // domain.md 8.1 — 무료(light) 정책은 **확정값**이라 목 데이터가 아니라 스키마와 함께 들어간다.
    // 유료 티어(daily·pro)는 가격·편수가 미정이므로 행을 만들지 않는다.
    // 드립 편수를 코드 상수로 두지 않기 위한 행이다(`plans.daily_drip_count`).
    await queryRunner.query(
      `INSERT INTO "plans" ("tier", "name", "description", "daily_play_limit", "daily_drip_count", "is_drip_enabled", "is_ads_enabled", "price_krw", "display_order", "is_active") VALUES ('light', '라이트', '무료로 하루 2편을 듣고, 매일 2편을 받아보세요', 2, 2, true, true, 0, 1, true) ON CONFLICT ("tier") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "device_tokens" DROP CONSTRAINT "fk_device_tokens_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "library_items" DROP CONSTRAINT "fk_library_items_contents"`,
    );
    await queryRunner.query(
      `ALTER TABLE "library_items" DROP CONSTRAINT "fk_library_items_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_interests" DROP CONSTRAINT "fk_user_interests_topics"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_interests" DROP CONSTRAINT "fk_user_interests_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "first_drip_jobs" DROP CONSTRAINT "fk_first_drip_jobs_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drip_excluded_contents" DROP CONSTRAINT "fk_drip_excluded_contents_contents"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drip_excluded_contents" DROP CONSTRAINT "fk_drip_excluded_contents_users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_topics" DROP CONSTRAINT "fk_content_topics_topics"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_topics" DROP CONSTRAINT "fk_content_topics_contents"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_stats" DROP CONSTRAINT "fk_content_stats_contents"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_device_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "device_tokens"`);
    await queryRunner.query(`DROP TABLE "plans"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_library_items_user_id_deleted_at_added_at_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_library_items_user_id_deleted_at_last_played_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_library_items_content_id"`,
    );
    await queryRunner.query(`DROP TABLE "library_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_user_interests_user_id_is_active"`,
    );
    await queryRunner.query(`DROP TABLE "user_interests"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_first_drip_jobs_status_last_attempted_at"`,
    );
    await queryRunner.query(`DROP TABLE "first_drip_jobs"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_drip_excluded_contents_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "drip_excluded_contents"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_content_topics_topic_id"`,
    );
    await queryRunner.query(`DROP TABLE "content_topics"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_topics_is_visible_display_order"`,
    );
    await queryRunner.query(`DROP TABLE "topics"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_content_stats_period_type_period_start_play_count"`,
    );
    await queryRunner.query(`DROP TABLE "content_stats"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_contents_status_published_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_contents_series_id_episode_no"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_contents_partner_id"`);
    await queryRunner.query(`DROP TABLE "contents"`);
  }
}
