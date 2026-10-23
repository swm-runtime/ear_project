import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `user_signals (user_id, content_id, action)` 인덱스 — "이 사용자가 이 편에 완청 신호를 남겼는가"를 바로 찾는다(2026-10-23).
 *
 * 완청을 라이브러리 행과 무관한 사실로 보면서(KAN-248) 이 확인이 **진행 저장(재생 중 5초마다)** 과 탐색·시리즈 목록의 완청 판정
 * (`COMPLETED_CONTENT_IDS_CTE`), 미니플레이어 복원, 드립 시리즈 대기에 들어갔다. 있던 인덱스는 `(user_id, created_at)`뿐이라
 * 그 사용자의 신호 행(최대 180일치)을 훑은 뒤 `content_id`·`action`으로 걸렀다 — 많이 듣는 사용자일수록 저장마다 느려진다.
 *
 * **`CONCURRENTLY`를 쓰지 않는다** — 마이그레이션이 트랜잭션 안에서 돈다(`1787000000000`과 같은 이유). 표가 작아 생성이 짧다.
 */
export class AddUserSignalsContentActionIndex1791700000000 implements MigrationInterface {
  name = 'AddUserSignalsContentActionIndex1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_user_signals_user_id_content_id_action" ON "user_signals" ("user_id", "content_id", "action")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_user_signals_user_id_content_id_action"`,
    );
  }
}
