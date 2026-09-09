import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `domain.md`가 정의했으나 스키마에 없던 것들을 채운다(코드 대조 2026-09-08).
 *
 * - `content_stats.replay_count` (5.4) — `POST /contents/:id/replay`가 `Idempotency-Key`까지
 *   요구하며 지키려던 값인데 **적재할 칸이 없었다.** 집계 배치는 별건이다
 * - `partners` (10.1) — `contents.partner_id`가 FK 없는 uuid로 떠 있었다. `chk_contents_partner_disclosure`가
 *   `origin = 'partner'`에 이 값을 강제하므로, 참조 무결성이 없는 채로 파트너 콘텐츠가 올라간다
 * - `notification_logs` (9.1) — "중복 발송 방지에 필요하므로 DB 테이블로 유지한다"(B-8)
 *
 * **`topics.is_visible` 기본값도 바로잡는다.** 4.1이 `DEFAULT false`로 정하고 그 이유까지
 * 적었는데(기본 `true`면 생성 즉시 0건 주제가 온보딩·탐색에 노출된다) 스키마는 `true`였다.
 * 앱 경로는 `TopicService.create`가 명시적으로 `false`를 넣어 막고 있었으나, DB 제약이
 * 이중 방어라는 원칙(1.1)이 뒤집혀 있던 자리다.
 *
 * 세 테이블·컬럼 모두 **아직 쓰는 코드가 없다.** 스키마가 계약을 따라잡는 것이 목적이며,
 * 소비 코드는 각각의 기능이 들어올 때 붙는다.
 */
export class AddMissingDomainTables1786700000000 implements MigrationInterface {
  name = 'AddMissingDomainTables1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "content_stats" ADD "replay_count" integer NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(
      `ALTER TABLE "topics" ALTER COLUMN "is_visible" SET DEFAULT false`,
    );

    await queryRunner.query(
      `CREATE TABLE "partners" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "name" character varying(100) NOT NULL,
         "contract_starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "contract_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "revenue_share_rate" double precision NOT NULL,
         "contact_email" character varying(255) NOT NULL,
         "status" character varying(20) NOT NULL,
         CONSTRAINT "pk_partners" PRIMARY KEY ("id")
       )`,
    );

    /**
     * **`NOT VALID`로 붙인다.** 기존 `contents.partner_id`에 `partners`에 없는 값이 남아
     * 있으면 검증이 실패해 마이그레이션 자체가 멈춘다 — 파트너 테이블이 없던 동안 올라간
     * 행이 그럴 수 있다. 신규·갱신 행에는 그대로 강제되므로 FR-12의 보장은 지금부터 선다.
     * 운영 데이터를 정리한 뒤 `VALIDATE CONSTRAINT`로 잠근다.
     */
    await queryRunner.query(
      `ALTER TABLE "contents" ADD CONSTRAINT "fk_contents_partners"
         FOREIGN KEY ("partner_id") REFERENCES "partners"("id")
         ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID`,
    );

    await queryRunner.query(
      `CREATE TABLE "notification_logs" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" BIGSERIAL NOT NULL,
         "user_id" uuid NOT NULL,
         "type" character varying(40) NOT NULL,
         "deep_link" character varying(2048),
         "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "sent_at" TIMESTAMP WITH TIME ZONE,
         "status" character varying(20) NOT NULL,
         "skip_reason" character varying(20),
         "opened_at" TIMESTAMP WITH TIME ZONE,
         CONSTRAINT "pk_notification_logs" PRIMARY KEY ("id")
       )`,
    );

    // domain.md 12.3 즉시 파기 목록 — 탈퇴 시 함께 사라져야 한다
    await queryRunner.query(
      `ALTER TABLE "notification_logs" ADD CONSTRAINT "fk_notification_logs_users"
         FOREIGN KEY ("user_id") REFERENCES "users"("id")
         ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notification_logs_user_id_scheduled_at"
         ON "notification_logs" ("user_id", "scheduled_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_notification_logs_user_id_scheduled_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_logs" DROP CONSTRAINT "fk_notification_logs_users"`,
    );
    await queryRunner.query(`DROP TABLE "notification_logs"`);
    await queryRunner.query(
      `ALTER TABLE "contents" DROP CONSTRAINT "fk_contents_partners"`,
    );
    await queryRunner.query(`DROP TABLE "partners"`);
    await queryRunner.query(
      `ALTER TABLE "topics" ALTER COLUMN "is_visible" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "content_stats" DROP COLUMN "replay_count"`,
    );
  }
}
