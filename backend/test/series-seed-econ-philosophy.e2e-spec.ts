import { DataSource } from 'typeorm';

import dataSourceForCli from '@/database/data-source';
import {
  ECON_PHILOSOPHY_SERIES,
  SeedEconPhilosophySeries1791100000000,
} from '@/database/migrations/1791100000000-SeedEconPhilosophySeries';

interface ContentRow {
  id: string;
  title: string;
  series_id: string | null;
  episode_no: number | null;
  total_episodes: number | null;
  content_version: number;
  audio_path: string;
  updated_at: Date;
}

interface SeriesRow {
  id: string;
  title: string;
  description: string;
  total_episodes: number;
  status: string;
  updated_at: Date;
}

const [ECON, WESTERN, EASTERN] = ECON_PHILOSOPHY_SERIES;
const SERIES_IDS = ECON_PHILOSOPHY_SERIES.map((seed) => seed.id);
const MAPPED_IDS = ECON_PHILOSOPHY_SERIES.flatMap((seed) =>
  seed.episodes.map(([, contentId]) => contentId),
);

/**
 * 경제 상식·서양 철학·동양 철학 시리즈 일회성 마이그레이션(KAN-235) E2E — 실제 DB 위에서 `up`을 돌린다.
 *
 * 로컬·CI DB에는 운영 콘텐츠 ID가 없으므로 표의 ID로 콘텐츠를 직접 만들어 두고 돌린 뒤 지운다.
 * 대상 ID나 고정 시리즈 id가 이미 있는 DB(개발계 덤프를 들인 로컬 등)에서는 실데이터를 건드리지 않도록 시작하지 않는다.
 */
describe('SeedEconPhilosophySeries 마이그레이션 E2E', () => {
  let dataSource: DataSource;
  const migration = new SeedEconPhilosophySeries1791100000000();
  const STAMP = `e2e-seed-econ-${Date.now().toString(36)}`;
  let userId: string;
  const extraContentIds: string[] = [];
  const otherSeriesIds: string[] = [];

  const up = async () => {
    const runner = dataSource.createQueryRunner();
    try {
      await migration.up(runner);
    } finally {
      await runner.release();
    }
  };

  const down = async () => {
    const runner = dataSource.createQueryRunner();
    try {
      await migration.down(runner);
    } finally {
      await runner.release();
    }
  };

  beforeAll(async () => {
    dataSource = await dataSourceForCli.initialize();
    const existing = await dataSource.query<
      { contents: number; series: number }[]
    >(
      `SELECT (SELECT count(*)::int FROM contents WHERE id = ANY($1::uuid[])) AS contents,
              (SELECT count(*)::int FROM series WHERE id = ANY($2::uuid[])) AS series`,
      [MAPPED_IDS, SERIES_IDS],
    );
    if (existing[0].contents > 0 || existing[0].series > 0) {
      throw new Error(
        '이 DB에 대상 콘텐츠나 시리즈가 이미 있다 — 실데이터를 지우지 않도록 테스트를 시작하지 않는다',
      );
    }
    const users = await dataSource.query<{ id: string }[]>(
      `INSERT INTO users (provider, provider_user_id, role, onboarding_completed)
       VALUES ('kakao', $1, 'user', true) RETURNING id`,
      [`${STAMP}-listener`],
    );
    userId = users[0].id;
  }, 60_000);

  afterEach(async () => {
    // 고정 시리즈를 먼저 풀고 지운 뒤(FK) 표의 콘텐츠·표 밖 콘텐츠·다른 시리즈를 지운다
    await dataSource.query(
      `UPDATE contents SET series_id = NULL WHERE series_id = ANY($1::uuid[])`,
      [SERIES_IDS],
    );
    await dataSource.query(`DELETE FROM series WHERE id = ANY($1::uuid[])`, [
      SERIES_IDS,
    ]);
    const contentIds = [...MAPPED_IDS, ...extraContentIds.splice(0)];
    await dataSource.query(
      `DELETE FROM library_items WHERE content_id = ANY($1::uuid[])`,
      [contentIds],
    );
    await dataSource.query(
      `DELETE FROM playback_progresses WHERE content_id = ANY($1::uuid[])`,
      [contentIds],
    );
    await dataSource.query(`DELETE FROM contents WHERE id = ANY($1::uuid[])`, [
      contentIds,
    ]);
    const others = otherSeriesIds.splice(0);
    await dataSource.query(`DELETE FROM series WHERE id = ANY($1::uuid[])`, [
      others,
    ]);
  });

  afterAll(async () => {
    if (userId) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    await dataSource.destroy();
  }, 60_000);

  it('표의 편이 모두 있으면 세 시리즈를 만들고 편 번호·총 편수를 채운다', async () => {
    // given
    await seedContents(MAPPED_IDS);

    // when
    await up();

    // then
    const series = await readSeries();
    expect(series).toHaveLength(3);
    expect(series.find((row) => row.id === ECON.id)).toMatchObject({
      title: '키워드로 훑어보는 경제 상식',
      total_episodes: 12,
      status: 'ongoing',
    });
    expect(series.find((row) => row.id === WESTERN.id)).toMatchObject({
      title: '시대별로 보는 서양 철학',
      total_episodes: 10,
      status: 'completed',
    });
    expect(series.find((row) => row.id === EASTERN.id)).toMatchObject({
      title: '시대별로 보는 동양 철학',
      total_episodes: 8,
      status: 'completed',
    });
    for (const seed of ECON_PHILOSOPHY_SERIES) {
      expect(series.find((row) => row.id === seed.id)?.description).toBe(
        seed.description,
      );
    }

    const contents = await readContents(MAPPED_IDS);
    for (const seed of ECON_PHILOSOPHY_SERIES) {
      for (const [episodeNo, contentId] of seed.episodes) {
        expect(contents.get(contentId)).toMatchObject({
          series_id: seed.id,
          episode_no: episodeNo,
          total_episodes: seed.totalEpisodes,
        });
      }
    }
    // 경제 상식은 10화 없이 11편이 묶인다
    const econNumbers = ECON.episodes.map(([episodeNo]) => episodeNo);
    expect(econNumbers).toHaveLength(11);
    expect(econNumbers).not.toContain(10);
  });

  it('콘텐츠 ID·버전·제목·오디오와 담기·재생 위치는 그대로 둔다', async () => {
    // given
    await seedContents(MAPPED_IDS);
    const target = WESTERN.episodes[2][1];
    await dataSource.query(
      `INSERT INTO library_items (user_id, content_id, source, status, added_at)
       VALUES ($1, $2, 'save', 'in_progress', now())`,
      [userId, target],
    );
    await dataSource.query(
      `INSERT INTO playback_progresses (user_id, content_id, position_sec, max_reached_sec)
       VALUES ($1, $2, 120, 150)`,
      [userId, target],
    );
    const before = await readContents(MAPPED_IDS);

    // when
    await up();

    // then
    const after = await readContents(MAPPED_IDS);
    expect(after.size).toBe(MAPPED_IDS.length);
    for (const contentId of MAPPED_IDS) {
      expect(after.get(contentId)).toMatchObject({
        title: before.get(contentId)?.title,
        content_version: 3,
        audio_path: before.get(contentId)?.audio_path,
      });
    }
    const library = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM library_items WHERE user_id = $1 AND content_id = $2`,
      [userId, target],
    );
    expect(library).toEqual([{ status: 'in_progress' }]);
    const progress = await dataSource.query<
      { position_sec: number; max_reached_sec: number }[]
    >(
      `SELECT position_sec, max_reached_sec FROM playback_progresses WHERE user_id = $1 AND content_id = $2`,
      [userId, target],
    );
    expect(progress).toEqual([{ position_sec: 120, max_reached_sec: 150 }]);
  });

  it('두 번 돌리면 결과가 첫 번째와 같고 updated_at 도 다시 바꾸지 않는다', async () => {
    // given
    await seedContents(MAPPED_IDS);
    await up();
    const firstContents = await readContents(MAPPED_IDS);
    const firstSeries = await readSeries();

    // when
    await up();

    // then
    expect(await readContents(MAPPED_IDS)).toEqual(firstContents);
    expect(await readSeries()).toEqual(firstSeries);
  });

  it('운영에서 시리즈 상태를 바꾼 뒤 다시 돌려도 시리즈 행을 덮지 않는다', async () => {
    // given
    await seedContents(MAPPED_IDS);
    await up();
    await dataSource.query(
      `UPDATE series SET status = 'completed' WHERE id = $1`,
      [ECON.id],
    );

    // when
    await up();

    // then
    const econ = (await readSeries()).find((row) => row.id === ECON.id);
    expect(econ?.status).toBe('completed');
  });

  it('표의 편이 하나도 없으면 시리즈 행을 만들지 않는다', async () => {
    // given — 로컬·CI 상태

    // when
    await up();

    // then
    expect(await readSeries()).toEqual([]);
  });

  it('일부 편만 있으면 있는 편만 묶고 편이 없는 시리즈는 만들지 않는다', async () => {
    // given — 경제 상식 1·2화와 서양 철학 10화만 있다
    const present = [
      ECON.episodes[0][1],
      ECON.episodes[1][1],
      WESTERN.episodes[9][1],
    ];
    await seedContents(present);

    // when
    await up();

    // then
    const series = await readSeries();
    expect(series.map((row) => row.id).sort()).toEqual(
      [ECON.id, WESTERN.id].sort(),
    );
    const contents = await readContents(present);
    expect(contents.get(present[0])).toMatchObject({
      series_id: ECON.id,
      episode_no: 1,
      total_episodes: 12,
    });
    expect(contents.get(present[2])).toMatchObject({
      series_id: WESTERN.id,
      episode_no: 10,
      total_episodes: 10,
    });
  });

  it('대상 편이 다른 시리즈에 묶여 있으면 멈추고 세 시리즈 모두 손대지 않는다', async () => {
    // given — 동양 철학 3화가 다른 시리즈 1화로 묶여 있다
    await seedContents(MAPPED_IDS);
    const other = await createOtherSeries();
    const boundId = EASTERN.episodes[2][1];
    await dataSource.query(
      `UPDATE contents SET series_id = $1, episode_no = 1, total_episodes = 3 WHERE id = $2`,
      [other, boundId],
    );

    // when / then
    await expect(up()).rejects.toThrow(/다른 시리즈에 묶여 있다/);
    expect(await readSeries()).toEqual([]);
    const contents = await readContents(MAPPED_IDS);
    expect(contents.get(boundId)?.series_id).toBe(other);
    expect(
      [...contents.values()].filter((row) => row.series_id !== null),
    ).toHaveLength(1);
  });

  it('표 밖 콘텐츠가 같은 편 번호로 이미 발행돼 있으면 멈춘다', async () => {
    // given — 1차 적용 뒤, 표 밖 콘텐츠가 서양 철학 2화로 발행돼 있고 표의 2화는 아직 풀려 있다
    await seedContents(MAPPED_IDS);
    await up();
    const westernSecond = WESTERN.episodes[1][1];
    await dataSource.query(
      `UPDATE contents SET series_id = NULL, episode_no = NULL, total_episodes = NULL WHERE id = $1`,
      [westernSecond],
    );
    const intruder = await insertContent(null);
    await dataSource.query(
      `UPDATE contents SET series_id = $1, episode_no = 2, total_episodes = 10 WHERE id = $2`,
      [WESTERN.id, intruder],
    );

    // when / then
    await expect(up()).rejects.toThrow(/같은 편 번호로 이미 발행돼 있다/);
    expect(
      (await readContents([westernSecond])).get(westernSecond),
    ).toMatchObject({ series_id: null, episode_no: null });
  });

  it('적용 뒤 경제 상식 10화를 시리즈 칸과 함께 발행하면 받아들여져 12편이 된다', async () => {
    // given
    await seedContents(MAPPED_IDS);
    await up();

    // when — 파이프라인 업로드가 싣는 값과 같다(series_id·episode_no 10·total_episodes 12)
    const tenth = await insertContent(null);
    await dataSource.query(
      `UPDATE contents SET series_id = $1, episode_no = 10, total_episodes = 12 WHERE id = $2`,
      [ECON.id, tenth],
    );

    // then
    const published = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM contents WHERE series_id = $1 AND status = 'published'`,
      [ECON.id],
    );
    expect(published[0].count).toBe(12);
  });

  it('down 은 세 시리즈의 편을 풀고 시리즈 행을 지운다', async () => {
    // given
    await seedContents(MAPPED_IDS);
    await up();

    // when
    await down();

    // then
    expect(await readSeries()).toEqual([]);
    const contents = await readContents(MAPPED_IDS);
    expect(contents.size).toBe(MAPPED_IDS.length);
    for (const row of contents.values()) {
      expect(row).toMatchObject({
        series_id: null,
        episode_no: null,
        total_episodes: null,
        content_version: 3,
      });
    }
  });

  /** 표의 ID로 단일 콘텐츠를 만든다 — 운영처럼 시리즈 칸 없이 발행된 상태, 버전 3 */
  async function seedContents(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await insertContent(id);
    }
  }

  async function insertContent(id: string | null): Promise<string> {
    const rows = await dataSource.query<{ id: string }[]>(
      `INSERT INTO contents (id, title, description, source_name, origin, audio_path, duration_sec,
                             thumbnail_url, content_version, status, published_at)
       VALUES (COALESCE($1::uuid, uuid_generate_v4()), $2, 'e2e 전용', 'E2E', 'ai_generated', $3, 600,
               -- 발행 시각을 과거로 둔다 — 병렬로 도는 탐색 e2e의 "새로 나온" 섹션을 밀어내지 않게
               'https://example.com/e2e-seed.png', 3, 'published', '2001-01-01T00:00:00Z')
       RETURNING id`,
      [id, `${STAMP} ${id ?? 'extra'}`, `${STAMP}/${id ?? 'extra'}.mp3`],
    );
    if (id === null) {
      extraContentIds.push(rows[0].id);
    }
    return rows[0].id;
  }

  async function createOtherSeries(): Promise<string> {
    const rows = await dataSource.query<{ id: string }[]>(
      `INSERT INTO series (title, description, total_episodes, status)
       VALUES ($1, '', 3, 'ongoing') RETURNING id`,
      [`${STAMP} 다른 시리즈`],
    );
    otherSeriesIds.push(rows[0].id);
    return rows[0].id;
  }

  async function readSeries(): Promise<SeriesRow[]> {
    return await dataSource.query<SeriesRow[]>(
      `SELECT id, title, description, total_episodes, status, updated_at
         FROM series WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [SERIES_IDS],
    );
  }

  async function readContents(
    ids: readonly string[],
  ): Promise<Map<string, ContentRow>> {
    const rows = await dataSource.query<ContentRow[]>(
      `SELECT id, title, series_id, episode_no, total_episodes, content_version, audio_path, updated_at
         FROM contents WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return new Map(rows.map((row) => [row.id, row]));
  }
});
