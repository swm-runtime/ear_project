import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { AudioProbe } from '@/modules/admin/audio-probe';
import { ContentStorageClient } from '@/modules/admin/content-storage.client';
import { ThumbnailImage } from '@/modules/admin/thumbnail-image';
import { UploadedFileInput } from '@/modules/admin/admin.types';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

/** 에러 본문 — `details`는 최상위에 펼쳐진다(`field`) */
interface ErrorBody {
  error_code: string;
  field?: string;
}

interface ContentItemBody {
  id: string;
  length_profile: string;
  variant_of_content_id: string | null;
  intro_version: string | null;
}

interface SeriesItemBody {
  id: string;
  length_profile: string;
  variant_of_series_id: string | null;
}

/**
 * 짧은 판 E2E(KAN-298) — 관리자 업로드·시리즈 만들기의 변형 필드(`length_profile` · `variant_of_*`) 저장과 400 판정을 실제 DB 위에서
 * 본다. 파일 처리(길이 추출·썸네일 변환·저장소)는 대역이다 — 각자 단위 테스트가 있다.
 */
describe('짧은 판 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const topicIds: string[] = [];
  const seriesIds: string[] = [];
  const STAMP = `e2e-short-${Date.now().toString(36)}`;
  const path = (p: string) => `/api/v1${p}`;
  let storedCount = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AudioProbe)
      .useValue({
        readDurationSec: () => Promise.resolve(540),
        readMetadata: () =>
          Promise.resolve({
            durationSec: 540,
            codec: 'mp3',
            bitrateKbps: 192,
            channels: 1,
            sampleRateHz: 44100,
          }),
      })
      .overrideProvider(ThumbnailImage)
      .useValue({
        normalize: (file: UploadedFileInput) =>
          Promise.resolve({
            file: { ...file, mimeType: 'image/webp' },
            extension: 'webp',
            width: 768,
            height: 768,
          }),
      })
      .overrideProvider(ContentStorageClient)
      .useValue({
        putAudio: () => Promise.resolve(`${STAMP}/audio-${++storedCount}.mp3`),
        putThumbnail: () => {
          const key = `${STAMP}/thumb-${++storedCount}.webp`;
          return Promise.resolve({ key, url: `https://cdn.example/${key}` });
        },
        remove: () => Promise.resolve([]),
        resolveKey: () => null,
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(traceIdMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  }, 60_000);

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM audit_logs WHERE actor = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    // 병렬로 도는 다른 e2e(드립 배치)가 이 파일의 발행분을 편성해 FK 행(CASCADE 아님)을 남길 수 있다 — 먼저 지운다
    for (const table of ['drip_excluded_contents', 'library_items']) {
      await dataSource.query(
        `DELETE FROM ${table} WHERE content_id IN (SELECT id FROM contents WHERE title LIKE $1)`,
        [`${STAMP}%`],
      );
    }
    // 짧은 판이 원본을 FK(RESTRICT)로 가리킨다 — 짧은 판부터 지운다
    await dataSource.query(
      `DELETE FROM contents WHERE title LIKE $1 AND variant_of_content_id IS NOT NULL`,
      [`${STAMP}%`],
    );
    await dataSource.query(`DELETE FROM contents WHERE title LIKE $1`, [
      `${STAMP}%`,
    ]);
    for (const seriesId of [...seriesIds].reverse()) {
      await dataSource.query(`DELETE FROM series WHERE id = $1`, [seriesId]);
    }
    for (const topicId of topicIds) {
      await dataSource.query(`DELETE FROM topics WHERE id = $1`, [topicId]);
    }
    await app.close();
  }, 60_000);

  it('업로드 — short 단편은 원본과 함께 저장되고, 원본 없음·원본이 짧은 판·standard에 원본이면 400', async () => {
    const admin = await createAdmin('upload');
    const topic = await seedTopic();

    // 생략하면 standard · 원본 없음
    const origin = (
      await upload(admin, topic.id, 'origin', {}).expect(HttpStatus.CREATED)
    ).body as ContentItemBody;
    expect(origin).toMatchObject({
      length_profile: 'standard',
      variant_of_content_id: null,
    });

    // short + 원본 → 저장
    const short = (
      await upload(admin, topic.id, 'short', {
        length_profile: 'short',
        variant_of_content_id: origin.id,
      }).expect(HttpStatus.CREATED)
    ).body as ContentItemBody;
    expect(short).toMatchObject({
      length_profile: 'short',
      variant_of_content_id: origin.id,
    });
    const [row] = await dataSource.query<
      { length_profile: string; variant_of_content_id: string }[]
    >(
      `SELECT length_profile, variant_of_content_id FROM contents WHERE id = $1`,
      [short.id],
    );
    expect(row).toEqual({
      length_profile: 'short',
      variant_of_content_id: origin.id,
    });

    // short 단편인데 원본 id 없음
    await expectField(
      upload(admin, topic.id, 'no-origin', { length_profile: 'short' }),
      'variant_of_content_id',
    );
    // 없는 원본
    await expectField(
      upload(admin, topic.id, 'missing-origin', {
        length_profile: 'short',
        variant_of_content_id: '00000000-0000-4000-8000-000000000000',
      }),
      'variant_of_content_id',
    );
    // 원본이 이미 짧은 판(변형의 변형)
    await expectField(
      upload(admin, topic.id, 'variant-of-variant', {
        length_profile: 'short',
        variant_of_content_id: short.id,
      }),
      'variant_of_content_id',
    );
    // standard인데 원본 id
    await expectField(
      upload(admin, topic.id, 'standard-with-origin', {
        variant_of_content_id: origin.id,
      }),
      'variant_of_content_id',
    );
    // 모르는 값은 형식 오류
    await upload(admin, topic.id, 'bad-profile', {
      length_profile: 'medium',
    }).expect(HttpStatus.BAD_REQUEST);
  }, 60_000);

  it('업로드 — intro_version은 받은 그대로 저장하고, 생략하면 NULL(기존 도입부)이며, 형식이 틀리면 400', async () => {
    const admin = await createAdmin('intro');
    const topic = await seedTopic();

    // 생략 → NULL
    const plain = (
      await upload(admin, topic.id, 'intro-omitted', {}).expect(
        HttpStatus.CREATED,
      )
    ).body as ContentItemBody;
    expect(plain.intro_version).toBeNull();

    // 값 → 그대로 저장(길이 프로필과 독립 — standard 편에도 새 도입부가 들어갈 수 있다)
    const hooked = (
      await upload(admin, topic.id, 'intro-hook', {
        intro_version: 'hook-v2',
      }).expect(HttpStatus.CREATED)
    ).body as ContentItemBody;
    expect(hooked).toMatchObject({
      length_profile: 'standard',
      intro_version: 'hook-v2',
    });

    const rows = await dataSource.query<
      { id: string; intro_version: string | null }[]
    >(`SELECT id, intro_version FROM contents WHERE id = ANY($1)`, [
      [plain.id, hooked.id],
    ]);
    expect(
      Object.fromEntries(rows.map((row) => [row.id, row.intro_version])),
    ).toEqual({ [plain.id]: null, [hooked.id]: 'hook-v2' });

    // 형식 오류 — 대문자 · 33자
    await upload(admin, topic.id, 'intro-upper', {
      intro_version: 'Hook-V2',
    }).expect(HttpStatus.BAD_REQUEST);
    await upload(admin, topic.id, 'intro-long', {
      intro_version: 'a'.repeat(33),
    }).expect(HttpStatus.BAD_REQUEST);

    // DB CHECK도 같은 규칙이다 — 업로드를 우회한 쓰기도 막힌다
    await expect(
      dataSource.query(
        `UPDATE contents SET intro_version = 'Bad Value' WHERE id = $1`,
        [plain.id],
      ),
    ).rejects.toThrow(/ck_contents_intro_version/);
  }, 60_000);

  it('시리즈 — 짧은 시리즈는 원본 시리즈와 함께 만들고, 편은 시리즈의 길이 프로필을 따른다', async () => {
    const admin = await createAdmin('series');
    const topic = await seedTopic();

    const originSeries = (
      await createSeries(admin, { title: `${STAMP} 원본 시리즈` }).expect(
        HttpStatus.CREATED,
      )
    ).body as SeriesItemBody;
    seriesIds.push(originSeries.id);
    expect(originSeries).toMatchObject({
      length_profile: 'standard',
      variant_of_series_id: null,
    });

    const shortSeries = (
      await createSeries(admin, {
        title: `${STAMP} 짧은 시리즈`,
        length_profile: 'short',
        variant_of_series_id: originSeries.id,
      }).expect(HttpStatus.CREATED)
    ).body as SeriesItemBody;
    seriesIds.push(shortSeries.id);
    expect(shortSeries).toMatchObject({
      length_profile: 'short',
      variant_of_series_id: originSeries.id,
    });

    // 짧은 시리즈의 원본 없음 · 원본이 짧은 시리즈 · standard에 원본
    await expectField(
      createSeries(admin, { title: 'x', length_profile: 'short' }),
      'variant_of_series_id',
    );
    await expectField(
      createSeries(admin, {
        title: 'x',
        length_profile: 'short',
        variant_of_series_id: shortSeries.id,
      }),
      'variant_of_series_id',
    );
    await expectField(
      createSeries(admin, {
        title: 'x',
        variant_of_series_id: originSeries.id,
      }),
      'variant_of_series_id',
    );

    // 원본 시리즈 1화 → 짧은 시리즈 1화(length_profile 생략 = 시리즈 값, 원본 화 지정)
    const originEpisode = (
      await upload(admin, topic.id, 'origin-ep1', {
        series_id: originSeries.id,
        episode_no: 1,
        total_episodes: 3,
      }).expect(HttpStatus.CREATED)
    ).body as ContentItemBody;
    const shortEpisode = (
      await upload(admin, topic.id, 'short-ep1', {
        series_id: shortSeries.id,
        episode_no: 1,
        total_episodes: 3,
        variant_of_content_id: originEpisode.id,
      }).expect(HttpStatus.CREATED)
    ).body as ContentItemBody;
    expect(shortEpisode).toMatchObject({
      length_profile: 'short',
      variant_of_content_id: originEpisode.id,
    });

    // 원본 화가 없는 짧은 시리즈 편도 된다
    const shortEpisode2 = (
      await upload(admin, topic.id, 'short-ep2', {
        series_id: shortSeries.id,
        episode_no: 2,
        total_episodes: 3,
      }).expect(HttpStatus.CREATED)
    ).body as ContentItemBody;
    expect(shortEpisode2).toMatchObject({
      length_profile: 'short',
      variant_of_content_id: null,
    });

    // 짧은 시리즈에 standard 편 · standard 시리즈에 short 편은 400(length_profile)
    await expectField(
      upload(admin, topic.id, 'short-ep3-standard', {
        series_id: shortSeries.id,
        episode_no: 3,
        total_episodes: 3,
        length_profile: 'standard',
      }),
      'length_profile',
    );
    await expectField(
      upload(admin, topic.id, 'origin-ep2-short', {
        series_id: originSeries.id,
        episode_no: 2,
        total_episodes: 3,
        length_profile: 'short',
        variant_of_content_id: originEpisode.id,
      }),
      'length_profile',
    );
  }, 60_000);

  async function expectField(
    pending: request.Test,
    field: string,
  ): Promise<void> {
    const response = await pending.expect(HttpStatus.BAD_REQUEST);
    expect(response.body as ErrorBody).toMatchObject({
      error_code: ErrorCode.VALIDATION_FAILED,
      field,
    });
  }

  function createSeries(auth: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(path('/admin/series'))
      .set('Authorization', auth)
      .send({ description: '', total_episodes: 3, ...body });
  }

  function upload(
    auth: string,
    topicId: string,
    label: string,
    fields: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post(path('/admin/contents'))
      .set('Authorization', auth)
      .field(
        'payload',
        JSON.stringify({
          title: `${STAMP} ${label}`,
          description: 'e2e 전용',
          origin: 'ai_generated',
          source_name: '참고한 자료: E2E',
          topic_ids: [topicId],
          sources: [{ title: 'E2E 소스' }],
          review_confirmed: true,
          market: 'kr',
          language: 'ko',
          ...fields,
        }),
      )
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'ep.mp3',
        contentType: 'audio/mpeg',
      })
      .attach('thumbnail', Buffer.from('fake-image'), {
        filename: 'thumb.png',
        contentType: 'image/png',
      });
  }

  async function createAdmin(label: string): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-${label}`,
        role: UserRole.ADMIN,
        onboardingCompleted: true,
        market: UserMarket.KR,
      }),
    );
    userIds.push(user.id);
    const token = app.get(JwtService).sign(
      {
        sub: user.id,
        role: UserRole.ADMIN,
        typ: 'access',
        market: UserMarket.KR,
      },
      { expiresIn: 600 },
    );
    return `Bearer ${token}`;
  }

  async function seedTopic(): Promise<Topic> {
    const repository = dataSource.getRepository(Topic);
    const topic = await repository.save(
      repository.create({
        name: `${STAMP}-${topicIds.length}`,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 971,
        market: UserMarket.KR,
      }),
    );
    topicIds.push(topic.id);
    return topic;
  }
});
