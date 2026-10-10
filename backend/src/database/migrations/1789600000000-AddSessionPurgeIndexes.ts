import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `sessions` 파기 배치용 인덱스 — `(expires_at)` · `(revoked_at)` 단독 인덱스를 만든다
 * (2026-09-26 감사 하 등급 #1, 2026-10-10 반영).
 *
 * `SessionPurgeScheduler`가 매시간 `revoked_at < ? OR expires_at < ?`로 지우는데(domain.md 12.1),
 * 있던 인덱스는 `(user_id)` · `(refresh_token_hash)`뿐이라 **매번 테이블 전체를 훑었다.**
 * 리프레시마다 행이 하나씩 늘어나므로(회전) `sessions`는 사용자 수에 비례해 빠르게 자란다.
 * 두 조건이 OR이라 복합 인덱스 하나로는 못 풀고, 단독 인덱스 둘을 두면 Postgres가 BitmapOr로 합친다.
 *
 * `revoked_at`은 활성 세션에서 NULL이지만 부분 인덱스로 두지 않는다 — 엔티티 `@Index`와 그대로 맞춰
 * `migration:generate`가 차이를 만들지 않게 한다. 지금 규모에서 크기 차이는 무시할 만하다.
 *
 * **`CONCURRENTLY`를 쓰지 않는다** — 마이그레이션이 트랜잭션 안에서 돈다(`1787000000000`과 같은 이유).
 */
export class AddSessionPurgeIndexes1789600000000 implements MigrationInterface {
  name = 'AddSessionPurgeIndexes1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_expires_at" ON "sessions" ("expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_revoked_at" ON "sessions" ("revoked_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_revoked_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_expires_at"`);
  }
}
