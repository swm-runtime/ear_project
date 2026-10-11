import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `play_records (play_date, user_id)` 인덱스 — 주간 청취 상위 %(`profile-api.md` 4.1 `listening_top_percent`,
 * KAN-168)의 "그 주에 나보다 많이 들은 사용자 수" 집계용(2026-10-11 감사 하 등급 #7).
 *
 * 그 쿼리는 `WHERE play_date IN (그 주 7일) GROUP BY user_id` 인데, 있던 인덱스는 `(user_id, play_date)` ·
 * `(content_id, play_date)` 뿐이라 **프로필을 열 때마다 테이블 전체를 훑었다**(PG 16 은 skip scan 이 없다).
 * `play_records`는 보존 기한이 없어 계속 자란다. 로컬 합성 200만 행 실측: 순차 스캔 135ms → 이 인덱스로 수 ms.
 *
 * `INCLUDE (listened_sec)`는 엔티티 `@Index`로 표현할 수 없어 두지 않는다 — `migration:generate`가 차이를 만들지
 * 않게 엔티티와 그대로 맞춘다. 그 주 행만 힙에서 읽으므로 충분하다.
 *
 * **`CONCURRENTLY`를 쓰지 않는다** — 마이그레이션이 트랜잭션 안에서 돈다(`1787000000000`과 같은 이유).
 * 지금 행 수(수천~수만)에서 잠금은 순간이다.
 */
export class AddPlayRecordsPlayDateIndex1789700000000 implements MigrationInterface {
  name = 'AddPlayRecordsPlayDateIndex1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_play_records_play_date_user_id" ON "play_records" ("play_date", "user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_play_records_play_date_user_id"`,
    );
  }
}
