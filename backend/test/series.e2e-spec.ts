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
import { ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { PlaybackProgress } from '@/modules/playback/entities/playback-progress.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

interface SeriesItemBody {
  id: string;
  title: string;
  description: string;
  total_episodes: number;
  status: string;
  episode_counts: { published: number; withdrawn: number; expired: number };
  max_published_episode_no: number | null;
}

/** 에러 본문 — `details`는 최상위에 펼쳐진다(`field`) */
interface ErrorBody {
  error_code: string;
  field?: string;
}

interface SeriesRefBody {
  id: string;
  title: string;
  episode_no: number;
  total_episodes: number;
}

interface SeriesDetailBody {
  series: {
    id: string;
    title: string;
    description: string;
    total_episodes: number;
    status: string;
    thumbnail_url: string;
    topic: { id: string; name: string } | null;
  };
  episodes: {
    episode_no: number;
    content: { id: string; series: SeriesRefBody | null };
    library: { item_id: string; status: string } | null;
    progress: { position_sec: number; max_reached_sec: number } | null;
    is_counted_today: boolean;
  }[];
}

/**
 * 시리즈 E2E(KAN-134 1단계) — 관리자 시리즈 API(만들기·목록·고치기·편수 하한·권한·감사 로그), 업로드의 시리즈 검증
 * (없는 시리즈·총 편수 불일치·번호 범위·발행 번호 중복), 회수 뒤 다른 편 발행, 시리즈 화면 `GET /series/:id`(편 번호순·내 상태·
 * 시장 격리), 라이브러리 항목과 상세의 `series` 객체를 실제 DB 위에서 본다.
 *
 * 업로드의 파일 처리(길이 추출·썸네일 변환·저장소)는 이 테스트의 대상이 아니라 대역으로 바꾼다 — 각자 단위 테스트가 있다.
 */
describe('시리즈 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const topicIds: string[] = [];
  const seriesIds: string[] = [];
  const STAMP = `e2e-series-${Date.now().toString(36)}`;
  const path = (p: string) => `/api/v1${p}`;
  let storedCount = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AudioProbe)
      .useValue({
        readDurationSec: () => Promise.resolve(600),
        readMetadata: () =>
          Promise.resolve({
            durationSec: 600,
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
    // 사용자부터 — 라이브러리·재생 위치가 콘텐츠를 FK로 가리킨다(사용자 삭제가 함께 지운다)
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM audit_logs WHERE actor = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const seriesId of seriesIds) {
      await dataSource.query(`DELETE FROM contents WHERE series_id = $1`, [
        seriesId,
      ]);
      await dataSource.query(`DELETE FROM series WHERE id = $1`, [seriesId]);
      await dataSource.query(`DELETE FROM audit_logs WHERE target = $1`, [
        `series:${seriesId}`,
      ]);
    }
    for (const topicId of topicIds) {
      await dataSource.query(`DELETE FROM topics WHERE id = $1`, [topicId]);
    }
    await app.close();
  }, 60_000);

  it('관리자 시리즈 API — 만들기·목록의 편 현황·고치기, 편수 하한, 권한, 감사 로그', async () => {
    const { auth: admin } = await createUser('admin-crud', UserRole.ADMIN);
    const { auth: listener } = await createUser('listener-crud', UserRole.USER);

    // 만들기 — status 를 빼면 ongoing
    const created = await createSeries(admin, {
      title: `${STAMP} 시리즈 A`,
      description: '소개',
      total_episodes: 3,
    }).expect(HttpStatus.CREATED);
    const series = created.body as SeriesItemBody;
    seriesIds.push(series.id);
    expect(series).toMatchObject({
      title: `${STAMP} 시리즈 A`,
      total_episodes: 3,
      status: 'ongoing',
      episode_counts: { published: 0, withdrawn: 0, expired: 0 },
      max_published_episode_no: null,
    });

    // 형식 오류는 400 — 빈 제목·편수 0·모르는 상태값·모르는 필드
    await createSeries(admin, {
      title: '   ',
      description: '',
      total_episodes: 3,
    }).expect(HttpStatus.BAD_REQUEST);
    await createSeries(admin, {
      title: 'x',
      description: '',
      total_episodes: 0,
    }).expect(HttpStatus.BAD_REQUEST);
    await createSeries(admin, {
      title: 'x',
      description: '',
      total_episodes: 2,
      status: 'cancelled',
    }).expect(HttpStatus.BAD_REQUEST);
    await createSeries(admin, {
      title: 'x',
      description: '',
      total_episodes: 2,
      market: 'kr',
    }).expect(HttpStatus.BAD_REQUEST);

    // 일반 계정은 403
    await createSeries(listener, {
      title: 'x',
      description: '',
      total_episodes: 2,
    }).expect(HttpStatus.FORBIDDEN);
    await request(app.getHttpServer())
      .get(path('/admin/series'))
      .set('Authorization', listener)
      .expect(HttpStatus.FORBIDDEN);

    // 편 2개 발행 → 목록의 편 현황 · 편수 하한
    const topic = await seedTopic(UserMarket.KR);
    await upload(admin, topic.id, {
      series_id: series.id,
      episode_no: 1,
      total_episodes: 3,
    }).expect(HttpStatus.CREATED);
    await upload(admin, topic.id, {
      series_id: series.id,
      episode_no: 2,
      total_episodes: 3,
    }).expect(HttpStatus.CREATED);

    const listed = await request(app.getHttpServer())
      .get(path('/admin/series'))
      .set('Authorization', admin)
      .expect(HttpStatus.OK);
    const row = (listed.body as { items: SeriesItemBody[] }).items.find(
      (item) => item.id === series.id,
    );
    expect(row).toMatchObject({
      episode_counts: { published: 2, withdrawn: 0, expired: 0 },
      max_published_episode_no: 2,
    });

    // 발행 중 최대 번호(2)보다 작게 줄이면 400(total_episodes) — 같게 줄이는 것은 된다
    const below = await patchSeries(admin, series.id, {
      total_episodes: 1,
    }).expect(HttpStatus.BAD_REQUEST);
    expect(below.body as ErrorBody).toMatchObject({
      error_code: ErrorCode.VALIDATION_FAILED,
      field: 'total_episodes',
    });
    const patched = await patchSeries(admin, series.id, {
      total_episodes: 2,
      status: 'completed',
      title: `${STAMP} 시리즈 A 완결`,
    }).expect(HttpStatus.OK);
    expect(patched.body as SeriesItemBody).toMatchObject({
      total_episodes: 2,
      status: 'completed',
      title: `${STAMP} 시리즈 A 완결`,
    });

    // 바꿀 키가 없으면 400 · 없는 시리즈는 404 · uuid 가 아니면 400
    await patchSeries(admin, series.id, {}).expect(HttpStatus.BAD_REQUEST);
    await patchSeries(admin, '00000000-0000-4000-8000-000000000000', {
      total_episodes: 5,
    }).expect(HttpStatus.NOT_FOUND);
    await patchSeries(admin, 'not-a-uuid', { total_episodes: 5 }).expect(
      HttpStatus.BAD_REQUEST,
    );

    // 감사 로그 — 만들기 1 · 고치기 1(거절된 요청은 남지 않는다)
    const audits = await dataSource.query<{ action: string }[]>(
      `SELECT action FROM audit_logs WHERE target = $1 ORDER BY created_at`,
      [`series:${series.id}`],
    );
    expect(audits.map((audit) => audit.action)).toEqual([
      'series.create',
      'series.update',
    ]);
  }, 60_000);

  it('업로드 검증 — 없는 시리즈·총 편수 불일치·번호 범위·발행 번호 중복은 400이고, 회수한 번호는 다시 올릴 수 있다', async () => {
    const { auth: admin } = await createUser('admin-upload', UserRole.ADMIN);
    const topic = await seedTopic(UserMarket.KR);
    const series = await createSeriesId(admin, 3);

    const expectField = async (
      body: Record<string, unknown>,
      field: string,
    ) => {
      const response = await upload(admin, topic.id, body).expect(
        HttpStatus.BAD_REQUEST,
      );
      expect(response.body as ErrorBody).toMatchObject({
        error_code: ErrorCode.VALIDATION_FAILED,
        field,
      });
    };

    // 시장·언어 누락 — 2단계부터 필수(global-api.md 4.9, KAN-190). 기본값 kr·ko 로 채우지 않는다
    await expectField({ market: undefined }, 'market');
    await expectField({ language: undefined }, 'language');

    // 없는 series_id
    await expectField(
      {
        series_id: '00000000-0000-4000-8000-000000000000',
        episode_no: 1,
        total_episodes: 3,
      },
      'series_id',
    );
    // series.total_episodes = 3 인데 4로 올림
    await expectField(
      { series_id: series, episode_no: 1, total_episodes: 4 },
      'total_episodes',
    );
    // 편 번호가 총 편수를 넘음(종전 검사 — 같은 필드)
    await expectField(
      { series_id: series, episode_no: 4, total_episodes: 3 },
      'episode_no',
    );

    // 2화 발행 → 같은 번호 다시 올리면 400(episode_no)
    const second = await upload(admin, topic.id, {
      series_id: series,
      episode_no: 2,
      total_episodes: 3,
    }).expect(HttpStatus.CREATED);
    const secondId = (second.body as { id: string }).id;
    await expectField(
      { series_id: series, episode_no: 2, total_episodes: 3 },
      'episode_no',
    );

    // 회수하면 같은 번호를 다시 올릴 수 있다(부분 유니크는 발행 중인 편만 본다)
    await request(app.getHttpServer())
      .post(path(`/admin/contents/${secondId}/withdraw`))
      .set('Authorization', admin)
      .send({ reason: 'e2e' })
      .expect(HttpStatus.OK);
    await upload(admin, topic.id, {
      series_id: series,
      episode_no: 2,
      total_episodes: 3,
    }).expect(HttpStatus.CREATED);

    // 그 상태에서 회수본을 되돌리면 같은 번호가 둘이 된다 — 409
    const restored = await request(app.getHttpServer())
      .post(path(`/admin/contents/${secondId}/restore`))
      .set('Authorization', admin)
      .expect(HttpStatus.CONFLICT);
    expect((restored.body as ErrorBody).error_code).toBe(ErrorCode.CONFLICT);
  }, 60_000);

  it('드립 다음 편 판정 입력 — 편마다 받음(삭제 포함)·미완청·제외를 실제 SQL로 읽는다(규칙 ②′)', async () => {
    const { auth: admin } = await createUser('admin-drip', UserRole.ADMIN);
    const listener = await createUser('listener-drip', UserRole.USER);
    const topic = await seedTopic(UserMarket.KR);
    const series = await createSeriesId(admin, 5);
    const ids: string[] = [];
    for (const episodeNo of [1, 2, 3, 4, 5]) {
      ids.push(await uploadId(admin, topic.id, series, episodeNo, 5));
    }
    // 1화 완청 · 2화 받았다 지움 · 3화 미완청 · 4화 드립 제외 · 5화 회수
    const items = dataSource.getRepository(LibraryItem);
    const base = { userId: listener.userId, source: LibraryItemSource.DRIP };
    await items.save([
      items.create({
        ...base,
        contentId: ids[0],
        status: LibraryItemStatus.COMPLETED,
        addedAt: new Date(),
        completedAt: new Date(),
      }),
      items.create({
        ...base,
        contentId: ids[1],
        status: LibraryItemStatus.UNPLAYED,
        addedAt: new Date(),
        deletedAt: new Date(),
      }),
      items.create({
        ...base,
        contentId: ids[2],
        status: LibraryItemStatus.IN_PROGRESS,
        addedAt: new Date(),
      }),
    ]);
    await dataSource.query(
      `INSERT INTO drip_excluded_contents (user_id, content_id, reason, excluded_at) VALUES ($1, $2, 'played', now())`,
      [listener.userId, ids[3]],
    );
    await dataSource
      .getRepository(Content)
      .update({ id: ids[4] }, { status: ContentStatus.WITHDRAWN });

    const states = await app
      .get(ContentService)
      .findSeriesEpisodeStates(
        [series],
        listener.userId,
        new Date(),
        UserMarket.KR,
      );

    expect(states.get(series)).toEqual([
      {
        contentId: ids[0],
        episodeNo: 1,
        received: true,
        held: false,
        excluded: false,
      },
      {
        contentId: ids[1],
        episodeNo: 2,
        received: true,
        held: false,
        excluded: false,
      },
      {
        contentId: ids[2],
        episodeNo: 3,
        received: true,
        held: true,
        excluded: false,
      },
      {
        contentId: ids[3],
        episodeNo: 4,
        received: false,
        held: false,
        excluded: true,
      },
    ]);
    // 다른 시장에는 노출 편이 없다
    expect(
      (
        await app
          .get(ContentService)
          .findSeriesEpisodeStates(
            [series],
            listener.userId,
            new Date(),
            UserMarket.GLOBAL,
          )
      ).size,
    ).toBe(0);
  }, 60_000);

  it('시리즈 화면·라이브러리 항목·상세 — 편 번호순·내 상태·series 객체, 다른 시장은 404', async () => {
    const { auth: admin } = await createUser('admin-view', UserRole.ADMIN);
    const listener = await createUser('listener-view', UserRole.USER);
    const globalListener = await createUser(
      'listener-global',
      UserRole.USER,
      UserMarket.GLOBAL,
    );
    const topic = await seedTopic(UserMarket.KR);
    const series = await createSeriesId(admin, 3, `${STAMP} 시리즈 화면`);

    // 3화를 먼저, 1화를 나중에 올린다 — 화면은 발행 순이 아니라 편 번호순이다
    const third = await uploadId(admin, topic.id, series, 3);
    const first = await uploadId(admin, topic.id, series, 1);

    // 1화를 담아 완청, 3화는 재생 위치만 있다
    await dataSource.getRepository(LibraryItem).save(
      dataSource.getRepository(LibraryItem).create({
        userId: listener.userId,
        contentId: first,
        source: LibraryItemSource.SAVE,
        status: LibraryItemStatus.COMPLETED,
        addedAt: new Date(Date.now() - 60_000),
        completedAt: new Date(),
      }),
    );
    await dataSource.getRepository(PlaybackProgress).save(
      dataSource.getRepository(PlaybackProgress).create({
        userId: listener.userId,
        contentId: third,
        positionSec: 120,
        maxReachedSec: 150,
      }),
    );

    const detail = await request(app.getHttpServer())
      .get(path(`/series/${series}`))
      .set('Authorization', listener.auth)
      .expect(HttpStatus.OK);
    const body = detail.body as SeriesDetailBody;
    expect(body.series).toMatchObject({
      id: series,
      title: `${STAMP} 시리즈 화면`,
      total_episodes: 3,
      status: 'ongoing',
    });
    expect(body.episodes.map((episode) => episode.episode_no)).toEqual([1, 3]);
    expect(body.episodes[0]).toMatchObject({
      content: {
        id: first,
        series: {
          id: series,
          title: `${STAMP} 시리즈 화면`,
          episode_no: 1,
          total_episodes: 3,
        },
      },
      library: { status: LibraryItemStatus.COMPLETED },
      progress: null,
    });
    expect(body.episodes[1]).toMatchObject({
      content: { id: third },
      library: null,
      progress: { position_sec: 120, max_reached_sec: 150 },
    });
    // 표지 = 노출 중인 가장 앞 편(1화)의 썸네일
    const firstThumbnail = (
      await dataSource.getRepository(Content).findOneByOrFail({ id: first })
    ).thumbnailUrl;
    expect(body.series.thumbnail_url).toBe(firstThumbnail);
    // 대표 중분류 — 두 편 모두 같은 주제라 그게 제목 아래 카테고리 줄이 된다
    expect(body.series.topic).toEqual({ id: topic.id, name: topic.name });

    // 다른 시장 사용자에게는 없는 시리즈다 · 없는 id 도 404 · uuid 가 아니면 400
    await request(app.getHttpServer())
      .get(path(`/series/${series}`))
      .set('Authorization', globalListener.auth)
      .expect(HttpStatus.NOT_FOUND);
    await request(app.getHttpServer())
      .get(path('/series/00000000-0000-4000-8000-000000000000'))
      .set('Authorization', listener.auth)
      .expect(HttpStatus.NOT_FOUND);
    await request(app.getHttpServer())
      .get(path('/series/not-a-uuid'))
      .set('Authorization', listener.auth)
      .expect(HttpStatus.BAD_REQUEST);

    // 라이브러리 항목에 같은 모양의 series 객체 — 완료 탭에 1화가 있다
    const library = await request(app.getHttpServer())
      .get(path('/users/me/library-items?filter=completed'))
      .set('Authorization', listener.auth)
      .expect(HttpStatus.OK);
    const item = (
      library.body as {
        items: { content: { id: string; series: SeriesRefBody | null } }[];
      }
    ).items.find((entry) => entry.content.id === first);
    expect(item?.content.series).toEqual({
      id: series,
      title: `${STAMP} 시리즈 화면`,
      episode_no: 1,
      total_episodes: 3,
    });

    // 상세 — 종전 series_id 를 유지한 채 id·title 이 붙는다(설치된 앱 호환)
    const contentDetail = await request(app.getHttpServer())
      .get(path(`/contents/${third}`))
      .set('Authorization', listener.auth)
      .expect(HttpStatus.OK);
    expect(
      (contentDetail.body as { content: { series: unknown } }).content.series,
    ).toEqual({
      series_id: series,
      id: series,
      title: `${STAMP} 시리즈 화면`,
      episode_no: 3,
      total_episodes: 3,
    });

    // 전 편을 회수하면 시리즈 화면도 404
    await dataSource
      .getRepository(Content)
      .update({ seriesId: series }, { status: ContentStatus.WITHDRAWN });
    await request(app.getHttpServer())
      .get(path(`/series/${series}`))
      .set('Authorization', listener.auth)
      .expect(HttpStatus.NOT_FOUND);
  }, 60_000);

  it('시리즈 표지(KAN-234) — 올리면 시리즈 화면·관리자 목록이 그것을 쓰고, 없으면 1화 썸네일, 형식·크기 위반은 400(cover)', async () => {
    const { auth: admin } = await createUser('admin-cover', UserRole.ADMIN);
    const listener = await createUser('listener-cover', UserRole.USER);
    const topic = await seedTopic(UserMarket.KR);
    const series = await createSeriesId(admin, 2, `${STAMP} 표지 시리즈`);
    const first = await uploadId(admin, topic.id, series, 1, 2);
    await uploadId(admin, topic.id, series, 2, 2);
    const firstThumbnail = (
      await dataSource.getRepository(Content).findOneByOrFail({ id: first })
    ).thumbnailUrl;
    const detailCover = async () =>
      (
        (
          await request(app.getHttpServer())
            .get(path(`/series/${series}`))
            .set('Authorization', listener.auth)
            .expect(HttpStatus.OK)
        ).body as SeriesDetailBody
      ).series.thumbnail_url;
    const adminRow = async () =>
      (
        (
          await request(app.getHttpServer())
            .get(path('/admin/series'))
            .set('Authorization', admin)
            .expect(HttpStatus.OK)
        ).body as { items: (SeriesItemBody & { cover_url: string | null })[] }
      ).items.find((item) => item.id === series);

    // 표지 없음 — 종전 그대로 1화 썸네일, 관리자 항목의 cover_url 은 null
    expect(await detailCover()).toBe(firstThumbnail);
    expect((await adminRow())?.cover_url).toBeNull();

    // 형식·크기 위반은 400 VALIDATION_FAILED(field = cover) — 콘텐츠 thumbnail 과 같은 판정
    const expectCoverRejected = async (
      buffer: Buffer,
      filename: string,
      contentType: string,
    ) => {
      const response = await putCover(admin, series, buffer, {
        filename,
        contentType,
      }).expect(HttpStatus.BAD_REQUEST);
      expect(response.body as ErrorBody).toMatchObject({
        error_code: ErrorCode.VALIDATION_FAILED,
        field: 'cover',
      });
    };
    await expectCoverRejected(
      Buffer.alloc(6 * 1024 * 1024),
      'cover.png',
      'image/png',
    );
    await expectCoverRejected(
      Buffer.from('fake-image'),
      'cover.gif',
      'image/gif',
    );
    // 파일 없이 보내도 400(cover)
    const missing = await request(app.getHttpServer())
      .put(path(`/admin/series/${series}/cover`))
      .set('Authorization', admin)
      .field('note', 'x')
      .expect(HttpStatus.BAD_REQUEST);
    expect(missing.body as ErrorBody).toMatchObject({
      error_code: ErrorCode.VALIDATION_FAILED,
      field: 'cover',
    });
    // 권한 · 없는 시리즈 · uuid 형식
    await putCover(listener.auth, series).expect(HttpStatus.FORBIDDEN);
    await putCover(admin, '00000000-0000-4000-8000-000000000000').expect(
      HttpStatus.NOT_FOUND,
    );
    await putCover(admin, 'not-a-uuid').expect(HttpStatus.BAD_REQUEST);
    // 거절된 요청은 아무것도 바꾸지 않는다
    expect(await detailCover()).toBe(firstThumbnail);

    // 올린다 → 응답·시리즈 화면·관리자 목록이 새 표지
    const uploaded = await putCover(admin, series).expect(HttpStatus.OK);
    const coverUrl = (uploaded.body as { cover_url: string }).cover_url;
    expect(coverUrl).toMatch(/^https:\/\/cdn\.example\/.+\.webp$/);
    expect(coverUrl).not.toBe(firstThumbnail);
    expect(uploaded.body as SeriesItemBody).toMatchObject({
      id: series,
      episode_counts: { published: 2, withdrawn: 0, expired: 0 },
    });
    expect(await detailCover()).toBe(coverUrl);
    expect((await adminRow())?.cover_url).toBe(coverUrl);
    // 편 썸네일은 그대로다 — 표지는 시리즈 칸만 바꾼다
    const detail = await request(app.getHttpServer())
      .get(path(`/series/${series}`))
      .set('Authorization', listener.auth)
      .expect(HttpStatus.OK);
    expect(
      (detail.body as { episodes: { content: { thumbnail_url: string } }[] })
        .episodes[0].content.thumbnail_url,
    ).toBe(firstThumbnail);

    // 다시 올리면 교체된다(PUT — 같은 요청 반복 가능)
    const replaced = await putCover(admin, series).expect(HttpStatus.OK);
    const replacedUrl = (replaced.body as { cover_url: string }).cover_url;
    expect(replacedUrl).not.toBe(coverUrl);
    expect(await detailCover()).toBe(replacedUrl);

    // 감사 로그 — 성공한 두 번만(거절된 요청은 남지 않는다)
    const audits = await dataSource.query<{ action: string }[]>(
      `SELECT action FROM audit_logs WHERE target = $1 ORDER BY created_at`,
      [`series:${series}`],
    );
    expect(audits.map((audit) => audit.action)).toEqual([
      'series.create',
      'series.cover',
      'series.cover',
    ]);
  }, 60_000);

  function putCover(
    auth: string,
    seriesId: string,
    buffer: Buffer = Buffer.from('fake-image'),
    file: { filename: string; contentType: string } = {
      filename: 'thumb-cover.png',
      contentType: 'image/png',
    },
  ) {
    return request(app.getHttpServer())
      .put(path(`/admin/series/${seriesId}/cover`))
      .set('Authorization', auth)
      .attach('cover', buffer, file);
  }

  function createSeries(auth: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(path('/admin/series'))
      .set('Authorization', auth)
      .send(body);
  }

  function patchSeries(
    auth: string,
    seriesId: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(path(`/admin/series/${seriesId}`))
      .set('Authorization', auth)
      .send(body);
  }

  async function createSeriesId(
    auth: string,
    totalEpisodes: number,
    title = `${STAMP} 시리즈`,
  ): Promise<string> {
    const response = await createSeries(auth, {
      title,
      description: '소개',
      total_episodes: totalEpisodes,
    }).expect(HttpStatus.CREATED);
    const id = (response.body as SeriesItemBody).id;
    seriesIds.push(id);
    return id;
  }

  function upload(
    auth: string,
    topicId: string,
    seriesFields: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post(path('/admin/contents'))
      .set('Authorization', auth)
      .field(
        'payload',
        JSON.stringify({
          title: `${STAMP} 편 ${String(seriesFields.episode_no)}`,
          description: 'e2e 전용',
          origin: 'ai_generated',
          source_name: '참고한 자료: E2E',
          topic_ids: [topicId],
          sources: [{ title: 'E2E 소스' }],
          review_confirmed: true,
          market: 'kr',
          language: 'ko',
          ...seriesFields,
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

  async function uploadId(
    auth: string,
    topicId: string,
    seriesId: string,
    episodeNo: number,
    totalEpisodes = 3,
  ): Promise<string> {
    const response = await upload(auth, topicId, {
      series_id: seriesId,
      episode_no: episodeNo,
      total_episodes: totalEpisodes,
    }).expect(HttpStatus.CREATED);
    return (response.body as { id: string }).id;
  }

  async function createUser(
    label: string,
    role: UserRole,
    market: UserMarket = UserMarket.KR,
  ): Promise<{ userId: string; auth: string }> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-${label}`,
        role,
        onboardingCompleted: true,
        market,
      }),
    );
    userIds.push(user.id);
    const token = app
      .get(JwtService)
      .sign({ sub: user.id, role, typ: 'access', market }, { expiresIn: 600 });
    return { userId: user.id, auth: `Bearer ${token}` };
  }

  async function seedTopic(market: UserMarket): Promise<Topic> {
    const repository = dataSource.getRepository(Topic);
    const topic = await repository.save(
      repository.create({
        name: `${STAMP}-${market}-${topicIds.length}`,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 970,
        market,
      }),
    );
    topicIds.push(topic.id);
    return topic;
  }
});
