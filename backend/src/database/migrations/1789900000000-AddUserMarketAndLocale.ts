import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 글로벌 트랙 1 — 시장 모델(KAN-187, `global-api.md` 2.1 · 8장).
 *
 * `users.market`(kr/global)과 로케일 세 컬럼을 더한다. **전부 추가형이고 기본값이 있어** 기존 행은 `kr`, 로케일은 비어
 * 있다 — KR 사용자의 어떤 응답도 바뀌지 않는다. `archived_users`에는 넣지 않는다: 거래 주체 식별과 무관해 보존 근거가 없다
 * (domain.md 11.3 — 닉네임·커리어를 담지 않는 것과 같은 이유).
 */
export class AddUserMarketAndLocale1789900000000 implements MigrationInterface {
  name = 'AddUserMarketAndLocale1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "market" character varying(20) NOT NULL DEFAULT 'kr'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "language_code" character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "region_code" character varying(2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "timezone" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "timezone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "region_code"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "language_code"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "market"`);
  }
}
