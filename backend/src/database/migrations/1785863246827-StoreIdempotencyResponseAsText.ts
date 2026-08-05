import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreIdempotencyResponseAsText1785863246827 implements MigrationInterface {
  name = 'StoreIdempotencyResponseAsText1785863246827';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // DROP + ADD는 보관 중인 응답을 버린다. 제자리 변환으로 재시도 창을 깨지 않는다
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ALTER COLUMN "response_body" TYPE text USING "response_body"::text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ALTER COLUMN "response_body" TYPE jsonb USING "response_body"::jsonb`,
    );
  }
}
