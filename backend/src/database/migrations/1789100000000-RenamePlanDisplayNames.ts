import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `plans` 표시 문구 변경 — PM 결정(2026-10-06, KAN-147): 이름을 영어로(Light·Daily·Pro), 설명에서 "무료로"·"광고 없이"를
 * 뺀다(앱에 광고가 없다). `domain.md` 8.1 "name·description 은 표시 문구라 DB 에서 고친다" — 개발계·운영에 같은 값이
 * 들어가야 하므로 손 SQL 대신 마이그레이션으로 둔다. 시드 마이그레이션은 기존 행을 덮지 않으니 여기서만 바꾼다.
 *
 * 운영에 들어가면 지금 깔린 앱(1.1.0)의 프로필·설정 플랜 이름도 바로 바뀐다(앱은 서버 값을 그린다).
 */
export class RenamePlanDisplayNames1789100000000 implements MigrationInterface {
  name = 'RenamePlanDisplayNames1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "plans" SET "name" = 'Light', "description" = '하루 2편까지 들을 수 있어요' WHERE "tier" = 'light'`,
    );
    await queryRunner.query(
      `UPDATE "plans" SET "name" = 'Daily', "description" = '하루 5편까지 들을 수 있어요' WHERE "tier" = 'daily'`,
    );
    await queryRunner.query(
      `UPDATE "plans" SET "name" = 'Pro', "description" = '제한 없이 마음껏 들을 수 있어요' WHERE "tier" = 'pro'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "plans" SET "name" = '라이트', "description" = '무료로 하루 2편까지 들을 수 있어요' WHERE "tier" = 'light'`,
    );
    await queryRunner.query(
      `UPDATE "plans" SET "name" = '데일리', "description" = '하루 5편까지 광고 없이 들을 수 있어요' WHERE "tier" = 'daily'`,
    );
    await queryRunner.query(
      `UPDATE "plans" SET "name" = '프로', "description" = '제한 없이 마음껏 들을 수 있어요' WHERE "tier" = 'pro'`,
    );
  }
}
