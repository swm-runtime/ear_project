import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CS 키워드 시리즈 16편 전환 — 일회성 데이터 마이그레이션(KAN-134 확정 설계 7번, 2026-10-17).
 *
 * "키워드로 빠르게 배우는 CS 지식" 16편이 단일 콘텐츠로 올라가 있다. 시리즈 지정 API는 두지 않기로 했으므로
 * (`admin-api.md` 4.10 — 업로드 뒤 시리즈 필드는 바꾸지 않는다) 여기서 한 번 묶는다.
 *
 * - **시리즈 id를 고정한다.** 운영 → 개발계 콘텐츠 동기화(`deploy/sync-content-*.sh`)는 행을 id로 맞춘다. 환경마다
 *   다른 id로 만들면 운영 덤프의 `contents.series_id`가 개발계에 없는 시리즈를 가리켜 FK가 들여오기를 막는다
 *   (GLOBAL 주제를 환경마다 따로 만들어 들여오기가 하루 넘게 멈춘 2026-10-15 사고와 같은 꼴).
 * - **`content_id`·`content_version`·제목·오디오는 바꾸지 않는다** — 담기·재생 위치·완청·별점·통계가 그대로 남는다.
 *   `content_version`을 올리지 않으므로 클라이언트가 재생 위치를 버리지 않는다.
 * - **없는 id는 건너뛴다**(로컬·개발계에 일부가 없을 수 있다). 16개 중 하나도 없으면 시리즈 행도 만들지 않는다 —
 *   편 없는 빈 시리즈가 관리자 목록에 남지 않게. 그 환경은 나중에 동기화가 시리즈 행과 편을 함께 가져온다.
 * - **멱등이다** — 시리즈는 `ON CONFLICT DO NOTHING`, 편은 값이 다를 때만 고친다. 다시 돌려도 결과가 같고,
 *   바뀐 것이 없으면 `updated_at`도 건드리지 않는다(동기화 지문이 불필요하게 바뀌지 않는다).
 * - 바꿀 때는 `updated_at`을 올린다 — raw SQL이라 `@UpdateDateColumn`이 돌지 않는데, 운영 내보내기는 표별
 *   `max(updated_at)` 지문으로 변화를 감지하므로 안 올리면 개발계가 이 변경을 받지 못한다.
 * - 대상 중 **다른 시리즈에 이미 묶인 편이 있으면 멈춘다** — 그 편을 옮기면 다른 시리즈의 편 순서가 깨진다.
 *   운영은 시리즈 편이 0건이라(2026-10-09 확인) 일어나지 않아야 하는 경우다.
 */
const CS_SERIES_ID = '7de91e6e-2e96-4aea-9ddb-80fe99179c2e';
const CS_TOTAL_EPISODES = 16;
const CS_SERIES_TITLE = '키워드로 빠르게 배우는 CS 지식';
const CS_SERIES_DESCRIPTION =
  '소프트웨어 개발부터 데이터베이스·운영체제·네트워크·보안까지, CS 핵심 키워드를 16편에 나눠 정리한 시리즈';

/** [편 번호, content_id] — 운영 콘텐츠 ID 기준(한국판 파이프라인 DB 발행 기록, KAN-134 표) */
const CS_EPISODES: readonly [number, string][] = [
  [1, '82a54da2-a7f7-4586-b647-5930c197a1e7'],
  [2, '4a25d439-bdf2-46ab-b5ee-cd08893f6d0c'],
  [3, 'b5215dbc-ae29-445a-8290-8553ef9a46ae'],
  [4, '8dc2e767-c224-4237-bbc7-f24c40d70cf5'],
  [5, '00c76bec-ad82-4efa-9eb7-106a03dd496d'],
  [6, 'd8bf3fc0-e74c-494a-a142-516072f75806'],
  [7, 'edbfcba2-1747-4859-b822-48fe20579b60'],
  [8, '9ace69cd-f638-4e21-807e-64d5216c3010'],
  [9, '1ff0a42c-f86d-4522-9a92-b050f90f6eef'],
  [10, '4246befb-f85b-4c90-ae9e-281bb7f8b804'],
  [11, '1910bae9-61a9-4981-81fd-f6200fb8288b'],
  [12, '2cee385b-5c95-4fa1-a603-6b2af3c23dba'],
  [13, 'fada807b-2e5c-4409-8b80-a64e6c0228a4'],
  [14, '81d48b01-549b-4519-9e5f-6c936a625fc7'],
  [15, '4c84f496-b32d-439f-94d4-64288bbaa4d3'],
  [16, 'd7160409-e61b-4060-a933-5db4c0990bff'],
];

export class SeedCsKeywordSeries1790700100000 implements MigrationInterface {
  name = 'SeedCsKeywordSeries1790700100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const contentIds = CS_EPISODES.map(([, contentId]) => contentId);
    const present = (await queryRunner.query(
      `SELECT "id", "series_id" FROM "contents" WHERE "id" = ANY($1::uuid[])`,
      [contentIds],
    )) as { id: string; series_id: string | null }[];

    if (present.length === 0) {
      return;
    }

    const boundElsewhere = present.filter(
      (row) => row.series_id !== null && row.series_id !== CS_SERIES_ID,
    );
    if (boundElsewhere.length > 0) {
      throw new Error(
        `CS 시리즈 대상 편이 이미 다른 시리즈에 묶여 있다 — 확인 뒤 다시 돌린다: ${boundElsewhere
          .map((row) => row.id)
          .join(', ')}`,
      );
    }

    await queryRunner.query(
      `INSERT INTO "series" ("id", "title", "description", "total_episodes", "status")
       VALUES ($1, $2, $3, $4, 'completed')
       ON CONFLICT ("id") DO NOTHING`,
      [CS_SERIES_ID, CS_SERIES_TITLE, CS_SERIES_DESCRIPTION, CS_TOTAL_EPISODES],
    );

    await queryRunner.query(
      `UPDATE "contents" c
          SET "series_id" = $1,
              "episode_no" = v."episode_no",
              "total_episodes" = $2,
              "updated_at" = now()
         FROM unnest($3::uuid[], $4::int[]) AS v("content_id", "episode_no")
        WHERE c."id" = v."content_id"
          AND (c."series_id" IS DISTINCT FROM $1::uuid
               OR c."episode_no" IS DISTINCT FROM v."episode_no"
               OR c."total_episodes" IS DISTINCT FROM $2::int)`,
      [
        CS_SERIES_ID,
        CS_TOTAL_EPISODES,
        contentIds,
        CS_EPISODES.map(([episodeNo]) => episodeNo),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "contents"
          SET "series_id" = NULL, "episode_no" = NULL, "total_episodes" = NULL, "updated_at" = now()
        WHERE "series_id" = $1`,
      [CS_SERIES_ID],
    );
    await queryRunner.query(`DELETE FROM "series" WHERE "id" = $1`, [
      CS_SERIES_ID,
    ]);
  }
}
