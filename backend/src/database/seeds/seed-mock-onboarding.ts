import 'dotenv/config';

import { DataSource } from 'typeorm';

import { toPreviousFinalMonthStart } from '@/common/utils/service-date.util';
import {
  ALL_TIME_PERIOD_START,
  ContentOrigin,
  ContentStatus,
  StatsPeriodType,
} from '@/modules/content/content.enum';
import { ContentSource } from '@/modules/content/entities/content-source.entity';
import { ContentStat } from '@/modules/content/entities/content-stat.entity';
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';

import { buildDataSourceOptions } from '../data-source';
import { MOCK_CONTENTS, MOCK_TOPICS } from './mock-onboarding.data';
import { validateEnv } from '@/config/env.validation';

/**
 * 파트너 목 콘텐츠의 `partner_id` · `license_expires_at`.
 * `chk_contents_partner_disclosure`(domain.md 5.1)가 파트너 행에 둘을 요구한다 —
 * `partners` 테이블이 아직 없어 FK 없는 고정 uuid로 채운다(partner 모듈 도입 시 대체).
 */
const MOCK_PARTNER_ID = 'f0000000-0000-4000-8000-000000000001';
const MOCK_LICENSE_EXPIRES_AT = new Date('2027-12-31T15:00:00.000Z');

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
      `[seed] topics=${MOCK_TOPICS.length} contents=+${summary.insertedContentCount} (skipped ${summary.skippedContentCount}) sources=+${summary.insertedSourceCount} normalized=${summary.normalizedContentCount}`,
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
): Promise<{
  insertedContentCount: number;
  skippedContentCount: number;
  insertedSourceCount: number;
  normalizedContentCount: number;
}> {
  const contentRepository = manager.getRepository(Content);
  const contentTopicRepository = manager.getRepository(ContentTopic);
  const contentStatRepository = manager.getRepository(ContentStat);
  const contentSourceRepository = manager.getRepository(ContentSource);

  const existingByTitle = new Map(
    (
      await contentRepository.find({
        select: {
          id: true,
          title: true,
          origin: true,
          sourceUrl: true,
          partnerId: true,
          licenseExpiresAt: true,
        },
      })
    ).map((content) => [content.title, content]),
  );

  // 시리즈는 같은 `series_id`를 공유해야 한다 (domain.md 5.1)
  const seriesIdByKey = new Map<string, string>();
  let insertedContentCount = 0;
  let skippedContentCount = 0;
  let insertedSourceCount = 0;
  let normalizedContentCount = 0;

  for (const [index, mock] of MOCK_CONTENTS.entries()) {
    const existing = existingByTitle.get(mock.title);

    if (existing) {
      // 콘텐츠는 이미 있어도 소스는 없을 수 있다 — content_sources 도입(2026-08-24)
      // 이전에 시드된 DB를 재실행 한 번으로 맞추기 위한 백필이다.
      insertedSourceCount += await backfillSources(
        contentSourceRepository,
        existing.id,
        mock,
      );
      normalizedContentCount += await backfillDisclosure(
        contentRepository,
        existing,
      );
      skippedContentCount += 1;
      continue;
    }

    if (mock.seriesKey && !seriesIdByKey.has(mock.seriesKey)) {
      seriesIdByKey.set(mock.seriesKey, crypto.randomUUID());
    }

    const isPartner = mock.sourceName === '퍼블리';

    const content = await contentRepository.save(
      contentRepository.create({
        title: mock.title,
        description: mock.description,
        authorName: mock.authorName,
        sourceName: mock.sourceName,
        // ai_generated의 원문 링크는 소스 목록(content_sources)이 담당한다 —
        // 콘텐츠 단위 source_url을 채우면 목록 더보기 시트에 [원문 보기]가 잘못 노출된다
        sourceUrl: isPartner ? `https://example.com/mock/${index + 1}` : null,
        origin: isPartner ? ContentOrigin.PARTNER : ContentOrigin.AI_GENERATED,
        // chk_contents_partner_disclosure — 파트너 행은 partner_id·license_expires_at 필수
        partnerId: isPartner ? MOCK_PARTNER_ID : null,
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
        licenseExpiresAt: isPartner ? MOCK_LICENSE_EXPIRES_AT : null,
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
    insertedSourceCount += await backfillSources(
      contentSourceRepository,
      content.id,
      mock,
    );
    insertedContentCount += 1;
  }

  return {
    insertedContentCount,
    skippedContentCount,
    insertedSourceCount,
    normalizedContentCount,
  };
}

/**
 * 출처 분기 확정(2026-08-24 — domain.md 5.1 CHECK 반영) **이전에 시드된 행을 맞춘다.**
 * ai_generated는 콘텐츠 단위 `source_url`을 비우고(목록 [원문 보기] 오노출 방지),
 * partner는 `chk_contents_partner_disclosure`가 요구하는 두 필드를 채운다. 멱등이다.
 */
async function backfillDisclosure(
  repository: import('typeorm').Repository<Content>,
  content: Content,
): Promise<number> {
  if (content.origin === ContentOrigin.AI_GENERATED) {
    if (content.sourceUrl === null) {
      return 0;
    }

    await repository.update(content.id, { sourceUrl: null });
    return 1;
  }

  if (content.partnerId !== null && content.licenseExpiresAt !== null) {
    return 0;
  }

  await repository.update(content.id, {
    partnerId: MOCK_PARTNER_ID,
    licenseExpiresAt: MOCK_LICENSE_EXPIRES_AT,
  });
  return 1;
}

/**
 * `ai_generated` 참고 소스를 채운다(domain.md 5.5). **이미 소스가 있는 콘텐츠는 건드리지
 * 않는다** — 시드 전체의 멱등 규칙과 같다. 배열 순서가 곧 `position`이다(1부터).
 */
async function backfillSources(
  repository: import('typeorm').Repository<ContentSource>,
  contentId: string,
  mock: (typeof MOCK_CONTENTS)[number],
): Promise<number> {
  if (!mock.sources || mock.sources.length === 0) {
    return 0;
  }

  const existingCount = await repository.countBy({ contentId });

  if (existingCount > 0) {
    return 0;
  }

  await repository.save(
    mock.sources.map((source, sourceIndex) =>
      repository.create({
        contentId,
        position: sourceIndex + 1,
        title: source.title,
        author: source.author ?? null,
        url: source.url ?? null,
      }),
    ),
  );

  return mock.sources.length;
}

seed().catch((error: unknown) => {
  console.error('[seed] failed', error);
  process.exitCode = 1;
});
