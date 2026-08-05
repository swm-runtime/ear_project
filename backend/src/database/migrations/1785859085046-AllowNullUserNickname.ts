import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullUserNickname1785859085046 implements MigrationInterface {
  name = 'AllowNullUserNickname1785859085046';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "nickname" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "nickname" SET NOT NULL`,
    );
  }
}
