import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeys1785859969702 implements MigrationInterface {
  name = 'AddIdempotencyKeys1785859969702';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_key" character varying(100) NOT NULL, "idempotency_key" character varying(255) NOT NULL, "endpoint" character varying(255) NOT NULL, "request_hash" character varying(128) NOT NULL, "status" character varying(20) NOT NULL, "response_status" smallint, "response_body" jsonb, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_idempotency_keys_owner_key_endpoint_idempotency_key" UNIQUE ("owner_key", "endpoint", "idempotency_key"), CONSTRAINT "PK_8ad20779ad0411107a56e53d0f6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_idempotency_keys_expires_at" ON "idempotency_keys"  ("expires_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_idempotency_keys_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
  }
}
