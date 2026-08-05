import 'dotenv/config';

import { DataSource } from 'typeorm';

import { toPreviousFinalMonthStart } from '@/common/utils/service-date.util';
import {
  ALL_TIME_PERIOD_START,
  ContentOrigin,
  ContentStatus,
  StatsPeriodType,
} from '@/modules/content/content.enum';
import { ContentStat } from '@/modules/content/entities/content-stat.entity';
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';

import { buildDataSourceOptions } from '../data-source';
import { MOCK_CONTENTS, MOCK_TOPICS } from './mock-onboarding.data';
import { validateEnv } from '@/config/env.validation';

/**
 * **개발 전용 시드.** `npm run seed:mock`으로 실행한다.
 *
 * 마이그레이션이 아니라 별도 스크립트인 이유: 여기 들어가는 콘텐츠는 운영 데이터가 아니라
 * 프론트엔드가 온보딩 1~3단계를 실제로 밟아보기 위한 목 데이터다. 마이그레이션에 넣으면
 * 모든 환경에 따라 들어간다.
 *
 * **이미 있는 행은 건드리지 않는다**(이름·제목 기준). 여러 번 실행해도 결과가 같다.
 */
async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('목 데이터 시드는 운영 환경에서 실행할 수 없다');
  }

  const dataSource = new DataSource(
    buildDataSourceOptions(validateEnv(process.env)),
  );
  await dataSource.initialize();

  try {
    const now = new Date();
    const summary = await dataSource.transaction(async (manager) => {
      const topicIdByName = await seedTopics(manager);
      return seedContents(manager, topicIdByName, now);
    });

    console.log(
      `[seed] topics=${MOCK_TOPICS.length} contents=+${summary.insertedContentCount} (skipped ${summary.skippedContentCount})`,
    );
  } finally {
    await dataSource.destroy();
  }
}

async function seedTopics(
  manager: import('typeorm').EntityManager,
): Promise<Map<string, string>> {
  const repository = manager.getRepository(Topic);
  const existing = await repository.find();
  const idByName = new Map(existing.map((topic) => [topic.name, topic.id]));

  const missing = MOCK_TOPICS.filter((topic) => !idByName.has(topic.name));

  if (missing.length > 0) {
    const saved = await repository.save(
      missing.map((topic) =>
        repository.create({
          name: topic.name,
          parentCategory: topic.parentCategory,
          isVisible: true,
          displayOrder: topic.displayOrder,
        }),
      ),
    );

    for (const topic of saved) {
      idByName.set(topic.name, topic.id);
    }
  }

  return idByName;
}

async function seedContents(
  manager: import('typeorm').EntityManager,
  topicIdByName: Map<string, string>,
  now: Date,
): Promise<{ insertedContentCount: number; skippedContentCount: number }> {
  const contentRepository = manager.getRepository(Content);
  const contentTopicRepository = manager.getRepository(ContentTopic);
  const contentStatRepository = manager.getRepository(ContentStat);

  const existingTitles = new Set(
    (await contentRepository.find({ select: { title: true } })).map(
      (content) => content.title,
    ),
  );

  // 시리즈는 같은 `series_id`를 공유해야 한다 (domain.md 5.1)
  const seriesIdByKey = new Map<string, string>();
  let insertedContentCount = 0;
  let skippedContentCount = 0;

  for (const [index, mock] of MOCK_CONTENTS.entries()) {
    if (existingTitles.has(mock.title)) {
      skippedContentCount += 1;
      continue;
    }

    if (mock.seriesKey && !seriesIdByKey.has(mock.seriesKey)) {
      seriesIdByKey.set(mock.seriesKey, crypto.randomUUID());
    }

    const content = await contentRepository.save(
      contentRepository.create({
        title: mock.title,
        description: mock.description,
        authorName: mock.authorName,
        sourceName: mock.sourceName,
        sourceUrl: `https://example.com/mock/${index + 1}`,
        origin:
          mock.sourceName === '퍼블리'
            ? ContentOrigin.PARTNER
            : ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: mock.seriesKey
          ? (seriesIdByKey.get(mock.seriesKey) ?? null)
          : null,
        episodeNo: mock.episodeNo ?? null,
        totalEpisodes: mock.totalEpisodes ?? null,
        // URL이 아니라 저장 경로다. 재생 URL은 매 요청 서명 발급이다 (domain.md 5.1)
        audioPath: `mock/audio/${index + 1}.mp3`,
        durationSec: mock.durationSec,
        thumbnailUrl: `https://picsum.photos/seed/ear-${index + 1}/400/400`,
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        // 신선도 정렬이 의미를 갖도록 발행일을 흩어 놓는다
        publishedAt: new Date(now.getTime() - (index + 1) * 86_400_000),
        withdrawnAt: null,
      }),
    );

    await contentTopicRepository.save(
      mock.topicNames
        .map((name) => topicIdByName.get(name))
        .filter((topicId): topicId is string => Boolean(topicId))
        .map((topicId) =>
          contentTopicRepository.create({ contentId: content.id, topicId }),
        ),
    );

    const stats = [
      contentStatRepository.create({
        contentId: content.id,
        periodType: StatsPeriodType.ALL,
        periodStart: ALL_TIME_PERIOD_START,
        playCount: mock.allTimePlayCount,
        completeCount: Math.floor(mock.allTimePlayCount * 0.6),
        totalListenSec: String(mock.allTimePlayCount * 300),
        saveCount: Math.floor(mock.allTimePlayCount * 0.3),
        sourceLinkClickCount: 0,
        isFinal: false,
      }),
    ];

    if (mock.lastMonthPlayCount > 0) {
      stats.push(
        contentStatRepository.create({
          contentId: content.id,
          periodType: StatsPeriodType.MONTH,
          periodStart: toPreviousFinalMonthStart(now),
          playCount: mock.lastMonthPlayCount,
          completeCount: Math.floor(mock.lastMonthPlayCount * 0.6),
          totalListenSec: String(mock.lastMonthPlayCount * 300),
          saveCount: Math.floor(mock.lastMonthPlayCount * 0.3),
          sourceLinkClickCount: 0,
          // 순위·정산은 `is_final = true` 행만 읽는다 (domain.md 5.4)
          isFinal: true,
        }),
      );
    }

    await contentStatRepository.save(stats);
    insertedContentCount += 1;
  }

  return { insertedContentCount, skippedContentCount };
}

seed().catch((error: unknown) => {
  console.error('[seed] failed', error);
  process.exitCode = 1;
});
