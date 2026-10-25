import 'dotenv/config';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource, QueryRunner } from 'typeorm';

import { AppModule } from '@/app.module';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { PlayRecord } from '@/modules/playback/entities/play-record.entity';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

/**
 * 프로필 주제 한 줄의 범위 집계 SQL E2E(`profile.md` 4.7-1 — "같은 직군 1위"·"안 들어본 주제" 순위 원천).
 * 실제 DB 위에서 시장·직군·나 제외 조건과 0초 행을 사용자 수에서 빼는지를 본다.
 *
 * 다른 스위트와 겹치지 않게 **1977년 서비스 날짜**와 이 실행 전용 직군 문자열을 쓴다(주간 상위 % 스위트는 1979~1980년).
 * 시장만으로 묶는 집계는 그 날짜의 다른 행도 셀 수 있어, 이 스위트가 심은 콘텐츠 id 로만 확인한다.
 */
describe('주제 한 줄 범위 집계 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let playbackService: PlaybackService;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const TOKEN_PREFIX = 'e2etopichl';
  const TOKEN = `${TOKEN_PREFIX}${Date.now()}`;
  const JOB = `${TOKEN}-job`;
  const OTHER_JOB = `${TOKEN}-other-job`;
  const DATES = ['1977-03-01', '1977-03-02'];
  const SUITE_LOCK_KEY = 'e2e:profile-topic-highlight-cohort';
  let lockRunner: QueryRunner;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
    playbackService = app.get(PlaybackService);

    lockRunner = dataSource.createQueryRunner();
    await lockRunner.connect();
    await lockRunner.query(`SELECT pg_advisory_lock(hashtext($1))`, [
      SUITE_LOCK_KEY,
    ]);
    // 이전 실행이 afterAll 전에 죽어 남긴 행을 지운다
    await dataSource.query(
      `DELETE FROM play_records WHERE user_id IN (
         SELECT id FROM users WHERE provider_user_id LIKE $1
       )`,
      [`${TOKEN_PREFIX}%`],
    );
    await dataSource.query(`DELETE FROM users WHERE provider_user_id LIKE $1`, [
      `${TOKEN_PREFIX}%`,
    ]);
  }, 120_000);

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM play_records WHERE user_id = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    if (lockRunner) {
      await lockRunner.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
        SUITE_LOCK_KEY,
      ]);
      await lockRunner.release();
    }
    await app.close();
  }, 60_000);

  it('같은 시장·같은 직군만, 나를 빼고 콘텐츠별로 합하며 0초만 있는 사용자는 들은 사람으로 세지 않는다', async () => {
    // given
    const c1 = await seedContent('c1');
    const c2 = await seedContent('c2');
    const me = await createUser('me', JOB);
    const peerA = await createUser('peer-a', JOB);
    const peerB = await createUser('peer-b', JOB);
    const silentPeer = await createUser('silent-peer', JOB);
    const otherJob = await createUser('other-job', OTHER_JOB);
    const globalPeer = await createUser('global-peer', JOB, UserMarket.GLOBAL);
    await seedPlay(me, c1, DATES[0], 500);
    await seedPlay(peerA, c1, DATES[0], 100);
    await seedPlay(peerA, c2, DATES[1], 300);
    await seedPlay(peerB, c2, DATES[0], 200);
    await seedPlay(silentPeer, c1, DATES[1], 0);
    await seedPlay(otherJob, c1, DATES[0], 999);
    await seedPlay(globalPeer, c2, DATES[0], 999);
    // 기간 밖
    await seedPlay(peerA, c1, '1977-04-01', 777);
    const cohort = {
      market: UserMarket.KR,
      jobCategory: JOB,
      excludeUserId: me,
    };

    // when
    const peerSums = await playbackService.sumListenedSecByContentForCohort(
      DATES,
      cohort,
    );
    const peerListeners = await playbackService.countListenersForCohort(
      DATES,
      cohort,
    );
    const marketSums = await playbackService.sumListenedSecByContentForCohort(
      DATES,
      { market: UserMarket.KR },
    );

    // then — 같은 직군(나 제외): c1 100 · c2 500, 들은 사람 peerA·peerB 2명
    expect(toMap(peerSums)).toEqual(
      new Map([
        [c1, 100],
        [c2, 500],
      ]),
    );
    expect(peerListeners).toBe(2);
    // 시장 전체(KR): c1 = 500 + 100 + 0 + 999, c2 = 300 + 200 — GLOBAL 은 빠진다
    const market = toMap(marketSums);
    expect(market.get(c1)).toBe(1599);
    expect(market.get(c2)).toBe(500);
  });

  function toMap(
    rows: { contentId: string; listenedSec: number }[],
  ): Map<string, number> {
    return new Map(
      rows
        .filter((row) => contentIds.includes(row.contentId))
        .map((row) => [row.contentId, row.listenedSec]),
    );
  }

  async function createUser(
    label: string,
    jobCategory: string,
    market: UserMarket = UserMarket.KR,
  ): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${TOKEN}-${label}`,
        role: UserRole.USER,
        onboardingCompleted: true,
        market,
        jobCategory,
      }),
    );
    userIds.push(user.id);
    return user.id;
  }

  async function seedContent(label: string): Promise<string> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${TOKEN} ${label}`,
        description: 'e2e 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `${TOKEN}/${label}.mp3`,
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

  async function seedPlay(
    userId: string,
    contentId: string,
    playDate: string,
    listenedSec: number,
  ): Promise<void> {
    const repository = dataSource.getRepository(PlayRecord);
    await repository.save(
      repository.create({
        userId,
        contentId,
        playDate,
        playedAt: new Date(`${playDate}T03:00:00.000Z`),
        isCounted: true,
        listenedSec,
      }),
    );
  }
});
