import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 경제 상식·서양 철학·동양 철학 시리즈 전환 — 일회성 데이터 마이그레이션(KAN-235, 2026-10-20).
 *
 * 세 기획 시리즈가 운영에 시리즈 API가 없던 때 단일 콘텐츠로 올라갔다. 회수 후 다시 올리면 콘텐츠 ID가 바뀌어
 * 담기·재생 기록이 끊기고, 업로드 뒤 시리즈 칸은 바꾸지 않으므로(`admin-api.md` 4.10) 여기서 한 번 묶는다.
 * CS 16편(`1790700100000-SeedCsKeywordSeries`)과 같은 방식이다.
 *
 * - **시리즈 id를 고정한다.** 운영 → 개발계 콘텐츠 동기화는 행을 id로 맞춘다 — 환경마다 다른 id면 운영 덤프의
 *   `contents.series_id`가 개발계에 없는 시리즈를 가리켜 FK가 들여오기를 막는다.
 * - **`content_id`·`content_version`·제목·오디오는 바꾸지 않는다** — 담기·재생 위치·완청·별점·통계가 그대로 남는다.
 * - **없는 id는 건너뛴다**(로컬·CI에는 없다). 시리즈마다 편이 하나도 없으면 그 시리즈 행도 만들지 않는다 —
 *   편 없는 빈 시리즈가 관리자 목록에 남지 않게. 그 환경은 나중에 동기화가 시리즈 행과 편을 함께 가져온다.
 * - **멱등이다** — 시리즈는 `ON CONFLICT DO NOTHING`, 편은 값이 다를 때만 고친다. 다시 돌려도 결과가 같고,
 *   바뀐 것이 없으면 `updated_at`도 건드리지 않는다. 시리즈 행을 덮지 않으므로 운영에서 경제 상식을 `completed`로
 *   바꾼 뒤 다시 돌려도 되돌리지 않는다.
 * - 바꿀 때는 `updated_at`을 올린다 — 운영 내보내기가 표별 `max(updated_at)` 지문으로 변화를 감지한다.
 * - 경제 상식 10화(주식시장)는 재발행 예정이라 표에 없다. 계획 편수는 12, 상태는 `ongoing`이다. 이 마이그레이션 뒤
 *   올라가면 업로드가 `series_id`·`episode_no` 10·`total_episodes` 12를 싣는다(파이프라인 몫).
 * - 대상 중 **다른 시리즈에 이미 묶인 편이 있으면 멈춘다** — 그 편을 옮기면 다른 시리즈의 편 순서가 깨진다.
 * - 대상 시리즈에 **표 밖 콘텐츠가 같은 번호로 이미 발행돼 있으면 멈춘다** — 부분 유니크
 *   `uq_contents_series_id_episode_no_published`에 걸릴 경우를 미리 이유와 함께 알린다. 어느 편을 남길지는 사람이 정한다.
 * - 모든 검사를 쓰기 전에 끝낸다 — 한 시리즈라도 걸리면 세 시리즈 모두 손대지 않는다.
 */
export interface SeriesSeed {
  id: string;
  title: string;
  description: string;
  totalEpisodes: number;
  status: 'ongoing' | 'completed';
  /** [편 번호, content_id] — 운영 콘텐츠 ID 기준(파이프라인 `backlog.published_content_ref`, 2026-10-20 조회) */
  episodes: readonly [number, string][];
}

export const ECON_PHILOSOPHY_SERIES: readonly SeriesSeed[] = [
  {
    id: 'cd37aa05-df98-4b21-849b-4f92f387a21d',
    title: '키워드로 훑어보는 경제 상식',
    description:
      '화폐와 금리부터 환율·채권·금융위기까지, 뉴스에 자주 나오는 경제 키워드를 12편에 나눠 정리한 시리즈',
    totalEpisodes: 12,
    status: 'ongoing',
    episodes: [
      [1, 'b6fc269b-1b94-4773-9dcd-e534da08655d'],
      [2, '570c0b9d-aa40-4233-8c67-07b7696c4ea6'],
      [3, 'b4840da2-5654-4679-8684-086339272b48'],
      [4, 'f88e32d9-cac6-451b-8e3c-920654cf1ffd'],
      [5, '342ad965-99c9-49ae-8315-d1e9220b03e8'],
      [6, '5214a200-4141-4bc8-be54-0f77b5a5caaa'],
      [7, 'c72effd6-1603-447c-9cc0-e367855965ce'],
      [8, 'c2d72a69-5ee4-428d-8493-c10041f9b76f'],
      [9, 'f870c6d5-e72c-4923-adf8-7c8a9cc21a93'],
      // 10화(주식시장)는 재발행 예정 — 업로드 때 시리즈 칸을 싣는다
      [11, '0b85c549-03a0-48d2-8f40-a9f0e9166f4b'],
      [12, '9e14a166-d030-4818-9696-3d99287569b6'],
    ],
  },
  {
    id: '197f4991-789d-439c-80df-258e444ca5fd',
    title: '시대별로 보는 서양 철학',
    description:
      '자연철학자에서 20세기까지, 시대마다 서양 철학이 던진 질문을 따라가는 시리즈',
    totalEpisodes: 10,
    status: 'completed',
    episodes: [
      [1, '21f86172-d45a-4613-9441-c91eb0780930'],
      [2, '4322eaed-4acf-42d9-97ef-398b8401d1e2'],
      [3, 'fd52abe7-0c04-4877-bd5c-f7b8d3de5958'],
      [4, 'baad2e6f-b19c-43e0-8464-c64e8a319f67'],
      [5, 'f54ec3f9-ec85-47c6-aacb-65a864ba9b7d'],
      [6, '21abe20b-e5c5-46c2-87d9-3decbd2d2064'],
      [7, '4fe0daba-2d55-4815-9a2b-990b3fed63dc'],
      [8, '8ed6c060-3255-4c46-8654-8350b983b92b'],
      [9, '0b69ea7e-7634-464b-b4ad-c52b0f782fc1'],
      [10, 'c71987f3-161b-4c84-960a-81970ce248c2'],
    ],
  },
  {
    id: 'bf07634b-b399-4bff-8c9c-04d2cae59e4c',
    title: '시대별로 보는 동양 철학',
    description:
      '공자에서 조선의 실학까지, 시대마다 동양 철학이 던진 질문을 따라가는 시리즈',
    totalEpisodes: 8,
    status: 'completed',
    episodes: [
      [1, '005249cd-8b90-4e94-8d4d-95bae78e8b05'],
      [2, '52f3322f-3a6b-47bb-aeef-bc4ca8770eda'],
      [3, 'a264973d-54af-4255-b105-e3777c4e9708'],
      [4, '71740cbf-e6a0-4321-bd88-6705ef26545f'],
      [5, 'b07b30ad-420a-4748-80ef-43b7e221b6a0'],
      [6, '53ef3ba7-471e-48f7-985b-227fbc44e2d6'],
      [7, 'eb44ea72-f2c1-4185-9ca9-aaa5e23257e1'],
      [8, 'e1021a4b-89c4-46fc-b04e-4ff4231bd3d9'],
    ],
  },
];

export class SeedEconPhilosophySeries1791100000000 implements MigrationInterface {
  name = 'SeedEconPhilosophySeries1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 검사 — 쓰기 전에 세 시리즈 모두 본다
    const presentBySeries = new Map<string, Set<string>>();
    for (const seed of ECON_PHILOSOPHY_SERIES) {
      const contentIds = seed.episodes.map(([, contentId]) => contentId);
      const present = (await queryRunner.query(
        `SELECT "id", "series_id" FROM "contents" WHERE "id" = ANY($1::uuid[])`,
        [contentIds],
      )) as { id: string; series_id: string | null }[];
      if (present.length === 0) {
        continue;
      }

      const boundElsewhere = present.filter(
        (row) => row.series_id !== null && row.series_id !== seed.id,
      );
      if (boundElsewhere.length > 0) {
        throw new Error(
          `"${seed.title}" 대상 편이 이미 다른 시리즈에 묶여 있다 — 확인 뒤 다시 돌린다: ${boundElsewhere
            .map((row) => row.id)
            .join(', ')}`,
        );
      }

      const collisions = (await queryRunner.query(
        `SELECT c."id", c."episode_no"
           FROM "contents" c
          WHERE c."series_id" = $1
            AND c."status" = 'published'
            AND c."episode_no" = ANY($2::int[])
            AND NOT (c."id" = ANY($3::uuid[]))`,
        [seed.id, seed.episodes.map(([episodeNo]) => episodeNo), contentIds],
      )) as { id: string; episode_no: number }[];
      if (collisions.length > 0) {
        throw new Error(
          `"${seed.title}"에 표 밖 콘텐츠가 같은 편 번호로 이미 발행돼 있다 — 하나만 남기고 회수한 뒤 다시 돌린다: ${collisions
            .map((row) => `${row.id}#${row.episode_no}`)
            .join(', ')}`,
        );
      }

      presentBySeries.set(seed.id, new Set(present.map((row) => row.id)));
    }

    // 2) 쓰기 — 편이 하나라도 있는 시리즈만
    for (const seed of ECON_PHILOSOPHY_SERIES) {
      if (!presentBySeries.has(seed.id)) {
        continue;
      }
      await queryRunner.query(
        `INSERT INTO "series" ("id", "title", "description", "total_episodes", "status")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("id") DO NOTHING`,
        [
          seed.id,
          seed.title,
          seed.description,
          seed.totalEpisodes,
          seed.status,
        ],
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
          seed.id,
          seed.totalEpisodes,
          seed.episodes.map(([, contentId]) => contentId),
          seed.episodes.map(([episodeNo]) => episodeNo),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const seriesIds = ECON_PHILOSOPHY_SERIES.map((seed) => seed.id);
    await queryRunner.query(
      `UPDATE "contents"
          SET "series_id" = NULL, "episode_no" = NULL, "total_episodes" = NULL, "updated_at" = now()
        WHERE "series_id" = ANY($1::uuid[])`,
      [seriesIds],
    );
    await queryRunner.query(
      `DELETE FROM "series" WHERE "id" = ANY($1::uuid[])`,
      [seriesIds],
    );
  }
}
