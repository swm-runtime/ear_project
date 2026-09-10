import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 보존 기간 배치(`domain.md` 12.1)가 쓰는 `created_at` 단독 인덱스를 만든다.
 *
 * 삭제 조건은 `created_at < cutoff` 하나인데, **네 테이블 어디에도 `created_at`으로
 * 시작하는 인덱스가 없었다.**
 *
 * | 테이블 | 있던 인덱스 | 왜 못 쓰는가 |
 * |---|---|---|
 * | `user_signals` | `(user_id, created_at)` | 선두가 `user_id`라 `created_at` 범위 조회에 못 쓴다 |
 * | `audio_access_logs` | `(content_id, issued_at)` · `(user_id, issued_at)` | 선두도 다르고 축도 `issued_at`이다 |
 * | `source_link_clicks` | `(content_id, created_at)` · `(user_id)` | 선두가 `content_id`다 |
 * | `notification_logs` | `(user_id, scheduled_at DESC)` | 선두도 다르고 축도 `scheduled_at`이다 |
 *
 * 인덱스 없이 두면 매일 도는 배치가 **성장이 가장 빠른 테이블 전체를 풀스캔한다**
 * (12.1 — `audio_access_logs`는 재생 중 5분마다 한 행씩 쌓인다). 지울 것이 없는 날에도
 * 스캔 비용은 그대로 든다.
 *
 * `domain.md` 12.1은 `user_signals` · `audio_access_logs` 둘만 짚었으나 실제로 확인해 보니
 * (2026-09-10, 로컬 스키마 `\d`) **네 테이블 모두 없다.** 넷 다 만든다.
 *
 * **`CONCURRENTLY`를 쓰지 않는다.** 마이그레이션이 트랜잭션 안에서 돌아 Postgres가 허용하지
 * 않는다. 지금 규모에서는 생성이 순식간이고, 커지면 운영에서 따로 잡아야 하는 작업이다.
 */
export class AddRetentionCreatedAtIndexes1787000000000 implements MigrationInterface {
  name = 'AddRetentionCreatedAtIndexes1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_user_signals_created_at" ON "user_signals" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audio_access_logs_created_at" ON "audio_access_logs" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_source_link_clicks_created_at" ON "source_link_clicks" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notification_logs_created_at" ON "notification_logs" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_notification_logs_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_source_link_clicks_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_audio_access_logs_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_user_signals_created_at"`,
    );
  }
}
