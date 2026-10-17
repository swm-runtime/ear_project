import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `series` 테이블 신설과 `contents.series_id` FK·발행 편 번호 유일성(KAN-134 확정 설계 1번, 2026-10-17).
 *
 * ## 순서 — 고아 `series_id`를 먼저 메우고 FK를 건다
 *
 * 종전 `contents.series_id`는 가리키는 테이블이 없는 "같은 값을 공유한다"는 표시였다. 운영에는 시리즈로 발행된 콘텐츠가
 * 없지만(2026-10-09 확인) 로컬·개발계 시드는 임의 uuid를 쓴다(`seed-mock-onboarding` · `drip-scenarios`). 그 값이
 * `series`에 없으면 FK 생성이 실패한다. 선택지는 셋이었다.
 *
 * - 고아 값을 NULL로 지운다 → 시드의 시리즈 시나리오(드립 연속 편)가 조용히 단일 콘텐츠로 바뀐다. 기각.
 * - FK를 `NOT VALID`로 걸고 둔다 → 기존 고아 행이 영영 남아 조회 코드가 "시리즈 행 없음" 분기를 계속 들고 있어야 한다. 기각.
 * - **고아 값마다 자리표시 시리즈 행을 만든다**(채택) — 제목은 그 시리즈의 가장 앞 편 제목, 소개는 빈 문자열,
 *   총 편수는 `max(total_episodes, episode_no, 1)`, 상태는 `ongoing`. 그 뒤 FK를 **검증된 상태로** 건다.
 *   운영은 대상이 0건이라 아무 행도 만들지 않는다. 자리표시 행은 관리자 API(`PATCH /admin/series/:id`)로 고칠 수 있다.
 *
 * ## 발행 편 번호 유일성
 *
 * `(series_id, episode_no) WHERE status = 'published'` 부분 유니크 — 같은 시리즈에 같은 번호가 둘 발행되지 않게 한다.
 * 회수·만료된 편은 빠지므로 "회수 후 같은 번호로 다시 올리기"는 막지 않는다. `series_id IS NOT NULL`을 조건에 더한 것은
 * 단일 콘텐츠(NULL)를 인덱스에 넣지 않으려는 것뿐이다(NULL끼리는 원래 충돌하지 않는다 — 판정은 같다).
 *
 * 이미 중복이 있으면 인덱스 생성이 실패한다 — 어느 편을 남길지는 사람이 정할 일이라 **고치지 않고 이유를 밝혀 멈춘다.**
 */
export class AddSeries1790700000000 implements MigrationInterface {
  name = 'AddSeries1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "series" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "total_episodes" integer NOT NULL,
        "status" character varying(20) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_series" PRIMARY KEY ("id"),
        CONSTRAINT "ck_series_total_episodes" CHECK ("total_episodes" >= 1),
        CONSTRAINT "ck_series_status" CHECK ("status" IN ('ongoing', 'completed'))
      )
    `);

    const duplicates = (await queryRunner.query(`
      SELECT "series_id", "episode_no", count(*)::int AS "count"
        FROM "contents"
       WHERE "status" = 'published' AND "series_id" IS NOT NULL
       GROUP BY "series_id", "episode_no"
      HAVING count(*) > 1
    `)) as { series_id: string; episode_no: number | null; count: number }[];
    if (duplicates.length > 0) {
      throw new Error(
        `같은 시리즈에 같은 편 번호로 발행된 콘텐츠가 있어 유니크 인덱스를 만들 수 없다 — 하나만 남기고 회수한 뒤 다시 돌린다: ${duplicates
          .map((row) => `${row.series_id}#${row.episode_no}(${row.count})`)
          .join(', ')}`,
      );
    }

    // 고아 series_id → 자리표시 시리즈 행. 제목은 가장 앞 편(번호 → 발행 시각 → id 순)의 제목이다
    await queryRunner.query(`
      INSERT INTO "series" ("id", "title", "description", "total_episodes", "status")
      SELECT orphan."series_id",
             (SELECT first_episode."title"
                FROM "contents" first_episode
               WHERE first_episode."series_id" = orphan."series_id"
               ORDER BY first_episode."episode_no" ASC NULLS LAST, first_episode."published_at" ASC, first_episode."id" ASC
               LIMIT 1),
             '',
             GREATEST(COALESCE(MAX(orphan."total_episodes"), 0), COALESCE(MAX(orphan."episode_no"), 0), 1),
             'ongoing'
        FROM "contents" orphan
       WHERE orphan."series_id" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "series" s WHERE s."id" = orphan."series_id")
       GROUP BY orphan."series_id"
    `);

    await queryRunner.query(
      `ALTER TABLE "contents" ADD CONSTRAINT "fk_contents_series" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_contents_series_id_episode_no_published" ON "contents" ("series_id", "episode_no") WHERE "status" = 'published' AND "series_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "uq_contents_series_id_episode_no_published"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" DROP CONSTRAINT "fk_contents_series"`,
    );
    // contents.series_id 값은 그대로 남는다 — 종전처럼 가리키는 테이블 없는 공유 값으로 돌아간다
    await queryRunner.query(`DROP TABLE "series"`);
  }
}
