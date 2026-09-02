import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActiveEmailVerificationUnique1785863832159 implements MigrationInterface {
  name = 'AddActiveEmailVerificationUnique1785863832159';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_verifications" DROP CONSTRAINT "uq_email_verifications_user_id_email_send_seq_sent_at"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_email_verifications_active" ON "email_verifications"  ("user_id", "email") WHERE "verified_at" IS NULL AND "invalidated_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."uq_email_verifications_active"`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_verifications" ADD CONSTRAINT "uq_email_verifications_user_id_email_send_seq_sent_at" UNIQUE ("user_id", "email", "send_seq", "sent_at")`,
    );
  }
}
