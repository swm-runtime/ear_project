import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentStatAggregationRepository } from '@/modules/playback/repositories/content-stat-aggregation.repository';

/**
 * `content_stats` 확정(domain.md 5.4) E2E — 실제 DB 위에서 재집계 SQL 을 돌린다. 다른 스위트와 겹치지 않게
 * 2001년 구간만 쓴다(원천 행이 없는 구간이라 upsert 는 아무 행도 만들지 않는다).
 */
describe('콘텐츠 통계 확정 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let repository: ContentStatAggregationRepository;
  const contentIds: string[] = [];
  const TOKEN = `e2estat${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    repository = app.get(ContentStatAggregationRepository);
  }, 60_000);

  afterAll(async () => {
    for (const id of contentIds) {
      // content_stats 는 contents FK CASCADE 로 함께 지워진다
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [id]);
    }
    await app.close();
  }, 60_000);

  const readRow = async (contentId: string, periodStart: string) =>
    (
      await dataSource.query<
        { is_final: boolean; play_count: number; total_listen_sec: string }[]
      >(
        `SELECT is_final, play_count, total_listen_sec FROM content_stats
          WHERE content_id = $1 AND period_type = 'week' AND period_start = $2`,
        [contentId, periodStart],
      )
    )[0];

  it('확정 재집계는 원천이 사라진 진행 중 행도 값 그대로 잠근다 — 진행 중 재집계는 잠그지 않는다', async () => {
    // given — 진행 중에 쓴 행(재생 1회·120초)인데 그 재생 원천이 확정 전에 지워진 상태
    const contentId = await seedContent();
    await dataSource.query(
      `INSERT INTO content_stats (content_id, period_type, period_start, play_count, total_listen_sec, is_final)
       VALUES ($1, 'week', '2001-03-05', 1, 120, false)`,
      [contentId],
    );

    // when — 같은 구간을 "진행 중"으로 다시 센다
    await repository.recompute('week', '2001-03-05', '2001-03-12', false);

    // then — 잠그지 않는다
    expect((await readRow(contentId, '2001-03-05')).is_final).toBe(false);

    // when — 구간이 끝나 확정한다
    await repository.recompute('week', '2001-03-05', '2001-03-12', true);

    // then — 잠기고, 값은 원천이 있을 때 센 그대로다
    expect(await readRow(contentId, '2001-03-05')).toEqual({
      is_final: true,
      play_count: 1,
      total_listen_sec: '120',
    });
  }, 60_000);

  it('확정은 그 구간·종류의 행만 잠근다 — 다른 주의 진행 중 행은 그대로다', async () => {
    // given
    const contentId = await seedContent();
    await dataSource.query(
      `INSERT INTO content_stats (content_id, period_type, period_start, play_count, is_final)
       VALUES ($1, 'week', '2001-04-02', 1, false), ($1, 'week', '2001-04-09', 1, false)`,
      [contentId],
    );

    // when
    await repository.recompute('week', '2001-04-02', '2001-04-09', true);

    // then
    expect((await readRow(contentId, '2001-04-02')).is_final).toBe(true);
    expect((await readRow(contentId, '2001-04-09')).is_final).toBe(false);
  }, 60_000);

  async function seedContent(): Promise<string> {
    const contents = dataSource.getRepository(Content);
    const content = await contents.save(
      contents.create({
        title: `${TOKEN} 콘텐츠`,
        description: 'e2e 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `${TOKEN}/${contentIds.length}.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(Date.now() - 60_000),
        withdrawnAt: null,
      }),
    );
    contentIds.push(content.id);
    return content.id;
  }
});
