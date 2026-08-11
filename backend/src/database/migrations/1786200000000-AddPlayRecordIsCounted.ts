import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 6.3 — 재청취 창(15일)의 차감 행 구분자(`paywall.md` 4.3-1, 확정 2026-08-10).
 *
 * 창 안의 재청취도 `listened_sec` 적산을 위해 행이 필요하므로 **행의 존재만으로는 차감을
 * 셀 수 없다.** `daily_play_count` 집계가 이 플래그로 차감 행만 세게 된다.
 *
 * **기존 행은 전부 `true`가 맞다.** 이 컬럼이 생기기 전의 재생은 예외 없이 차감된
 * 재생이었다(창 판정 자체가 없었다). 기본값이 그대로 정답이라 별도 백필이 없다.
 */
export class AddPlayRecordIsCounted1786200000000 implements MigrationInterface {
  name = 'AddPlayRecordIsCounted1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "play_records" ADD "is_counted" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "play_records" DROP COLUMN "is_counted"`,
    );
  }
}
