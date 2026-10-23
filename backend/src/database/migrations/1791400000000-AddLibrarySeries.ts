import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `library_series` 신설 — 시리즈째 담기 기록(domain.md 6.1-1, KAN-245 `tickets/backend/archive/series-follow-new-episodes.md`).
 *
 * 시리즈째 담은 사용자에게 **새로 공개되는 편이 라이브러리에 따라 들어온다**(PM 2026-10-22 14:57). 그 판정의 근거가 이 표의
 * 살아 있는 행 하나다 — 편 하나씩 담은 것·드립 적립은 따라오기가 아니다. 라이브러리는 편 단위(`library_items`) 그대로다.
 *
 * - `uq_library_series_user_id_series_id` — 사용자 × 시리즈 1행. 빼기는 소프트 삭제(`deleted_at`)이고 다시 담으면 같은 행을
 *   되살린다(실행 취소가 `added_at`을 유지하려면 행이 남아 있어야 한다).
 * - `idx_library_series_series_id_deleted_at` — 새 편 적립(발행 시 "그 시리즈를 담은 살아 있는 사용자")이 시리즈 축으로 읽는다.
 *   유니크는 `user_id`가 선두라 이 방향에 쓸 수 없다(`idx_library_items_content_id`와 같은 이유).
 * - `users` FK **ON DELETE CASCADE** — 탈퇴 즉시 파기 대상이다(domain.md 12.3). 탈퇴 서비스는 사용자 행 삭제로 함께 지운다.
 * - `series` FK는 NO ACTION — 시리즈에는 삭제 API가 없다(`contents.series_id`와 같은 쪽).
 *
 * 운영 안전성: 새 빈 표라 기존 표를 다시 쓰거나 잠그지 않는다(FK 두 개는 참조 표에 SHARE ROW EXCLUSIVE를 순간 잡는다 — 빈 표라
 * 검증할 행이 없다). 소급 적재는 하지 않는다(티켓 범위 밖). 운영 → 개발계 콘텐츠 동기화(`deploy/sync-content-*.sh`)는 이 표를
 * 옮기지 않는다 — 사용자 데이터다.
 */
export class AddLibrarySeries1791400000000 implements MigrationInterface {
  name = 'AddLibrarySeries1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "library_series" (
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "user_id" uuid NOT NULL,
         "series_id" uuid NOT NULL,
         "added_at" TIMESTAMP WITH TIME ZONE NOT NULL,
         "deleted_at" TIMESTAMP WITH TIME ZONE,
         CONSTRAINT "PK_library_series_id" PRIMARY KEY ("id"),
         CONSTRAINT "uq_library_series_user_id_series_id" UNIQUE ("user_id", "series_id"),
         CONSTRAINT "fk_library_series_users"
           FOREIGN KEY ("user_id") REFERENCES "users"("id")
           ON DELETE CASCADE ON UPDATE NO ACTION,
         CONSTRAINT "fk_library_series_series"
           FOREIGN KEY ("series_id") REFERENCES "series"("id")
           ON DELETE NO ACTION ON UPDATE NO ACTION
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_library_series_series_id_deleted_at" ON "library_series" ("series_id", "deleted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_library_series_series_id_deleted_at"`,
    );
    await queryRunner.query(`DROP TABLE "library_series"`);
  }
}
