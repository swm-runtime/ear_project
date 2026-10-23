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

interface LibraryListBody {
  items: {
    id: string;
    source: string;
    added_at: string;
    content: { id: string };
  }[];
}

interface SaveBody {
  series_id: string;
  added_count: number;
  client_seq: number;
}

interface UnsaveBody {
  series_id: string;
  removed_item_ids: string[];
  client_seq: number;
}

interface RestoreBody {
  series_id: string;
  restored_item_ids: string[];
  is_saved: boolean;
}

interface Actor {
  userId: string;
  auth: string;
}

/**
 * 시리즈째 담기와 새 편 자동 적립 E2E(KAN-245 — `tickets/backend/archive/series-follow-new-episodes.md` 완료 조건).
 *
 * 새 편은 실제 관리자 업로드(`POST /admin/contents`)로 발행한다 — 적립 훅이 그 경로에 있다. 파일 처리(길이 추출·썸네일
 * 변환·저장소)는 대역으로 바꾼다(`series.e2e-spec.ts`와 같다).
 *
 * **발행 시각을 과거로 옮긴다.** 업로드는 `published_at = now`라, 그대로 두면 병렬로 도는 다른 스위트의 탐색 "신규" 섹션을
 * 이 편들이 밀어낸다(알려진 CI 흔들림). 모든 확인은 이 스위트가 만든 사용자·시리즈 범위로 한정한다.
 */
describe('시리즈째 담기 · 새 편 자동 적립 E2E (KAN-245)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let admin: Actor;
  let topic: Topic;
  const userIds: string[] = [];
  const seriesIds: string[] = [];
  const STAMP = `e2e-sfollow-${Date.now().toString(36)}`;
  const PAST = new Date('2020-01-01T00:00:00.000Z');
  const path = (p: string) => `/api/v1${p}`;
  let storedCount = 0;
  let userCount = 0;

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

    admin = await createUser(UserRole.ADMIN);
    const topicRepository = dataSource.getRepository(Topic);
    topic = await topicRepository.save(
      topicRepository.create({
        name: `${STAMP}-topic`,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 971,
        market: UserMarket.KR,
      }),
    );
  }, 60_000);

  afterAll(async () => {
    // 사용자부터 — library_items·library_series·user_signals 가 FK CASCADE 로 함께 지워진다
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM audit_logs WHERE actor = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const seriesId of seriesIds) {
      // 탈퇴로 지운 사용자 외에 남은 행이 있으면 series 삭제가 FK 로 막힌다 — 방어로 먼저 지운다
      await dataSource.query(
        `DELETE FROM library_series WHERE series_id = $1`,
        [seriesId],
      );
      await dataSource.query(
        `DELETE FROM library_items WHERE content_id IN (SELECT id FROM contents WHERE series_id = $1)`,
        [seriesId],
      );
      await dataSource.query(`DELETE FROM contents WHERE series_id = $1`, [
        seriesId,
      ]);
      await dataSource.query(`DELETE FROM series WHERE id = $1`, [seriesId]);
      await dataSource.query(`DELETE FROM audit_logs WHERE target = $1`, [
        `series:${seriesId}`,
      ]);
    }
    if (topic) {
      await dataSource.query(`DELETE FROM topics WHERE id = $1`, [topic.id]);
    }
    await app.close();
  }, 60_000);

  it('연재 중 5편·라이브러리 0편에서 시리즈째 담으면 5편이 들어오고 is_saved 가 true 다 — 다시 보내도 0편(멱등)', async () => {
    // given
    const series = await createSeriesId(8);
    const episodes = await publishEpisodes(series, [1, 2, 3, 4, 5]);
    const user = await createUser();

    // 담기 전 — is_saved false
    expect((await getSeries(user, series)).is_saved).toBe(false);

    // when
    const saved = await saveSeries(user, series, 7).expect(HttpStatus.OK);

    // then
    expect(saved.body as SaveBody).toEqual({
      series_id: series,
      added_count: 5,
      client_seq: 7,
    });
    expect(await countLibrarySeries(user.userId, series)).toBe(1);
    expect((await getSeries(user, series)).is_saved).toBe(true);
    const library = await listLibrary(user);
    expect(library.map((item) => item.content.id).sort()).toEqual(
      [...episodes].sort(),
    );
    expect(library.every((item) => item.source === 'save')).toBe(true);
    // 편 담기 규칙 — 라이브러리 상태가 바뀐 편마다 save 신호 하나
    expect(await countSignals(user.userId, 'save')).toBe(5);

    // 다시 보내면 아무것도 바뀌지 않는다 — 행·신호가 늘지 않는다
    const again = await saveSeries(user, series, 8).expect(HttpStatus.OK);
    expect(again.body as SaveBody).toMatchObject({
      added_count: 0,
      client_seq: 8,
    });
    expect(await countLibrarySeries(user.userId, series)).toBe(1);
    expect(await countSignals(user.userId, 'save')).toBe(5);
  }, 60_000);

  it('일부만 담겨 있으면 없는 편과 뺀 편만 센다 — 살아 있는 편은 그대로', async () => {
    // given — 1화는 담겨 있고 2화는 담았다 뺐다
    const series = await createSeriesId(3);
    const [first, second] = await publishEpisodes(series, [1, 2, 3]);
    const user = await createUser();
    await saveEpisode(user, first);
    await saveEpisode(user, second);
    await request(app.getHttpServer())
      .delete(path(`/contents/${second}/save?client_seq=2`))
      .set('Authorization', user.auth)
      .expect(HttpStatus.OK);
    const firstAddedAt = (await listLibrary(user)).find(
      (item) => item.content.id === first,
    )?.added_at;

    // when
    const saved = await saveSeries(user, series, 3).expect(HttpStatus.OK);

    // then — 2화(되살림)·3화(새로) 두 편
    expect((saved.body as SaveBody).added_count).toBe(2);
    const library = await listLibrary(user);
    expect(library).toHaveLength(3);
    // 이미 담긴 1화는 적립 시각이 바뀌지 않는다(편 담기 규칙)
    expect(library.find((item) => item.content.id === first)?.added_at).toBe(
      firstAddedAt,
    );
  }, 60_000);

  it('새 편 발행 — 시리즈째 담은 A의 라이브러리 맨 위에만 들어오고, 편 하나만 담은 B에게는 오지 않는다', async () => {
    // given
    const series = await createSeriesId(8);
    const episodes = await publishEpisodes(series, [1, 2, 3, 4, 5]);
    const userA = await createUser();
    const userB = await createUser();
    await saveSeries(userA, series, 1).expect(HttpStatus.OK);
    await saveEpisode(userB, episodes[0]);

    // when
    const sixth = await publishEpisode(series, 6);

    // then
    const libraryA = await listLibrary(userA);
    expect(libraryA[0]).toMatchObject({
      content: { id: sixth },
      source: 'save',
    });
    expect(libraryA).toHaveLength(6);
    const libraryB = await listLibrary(userB);
    expect(libraryB.map((item) => item.content.id)).toEqual([episodes[0]]);
    // 자동 적립은 사용자의 담기 조작이 아니라 신호를 남기지 않는다
    expect(await countSignals(userA.userId, 'save', sixth)).toBe(0);
  }, 60_000);

  it('A가 3화만 따로 뺐다면 7화는 들어오고 3화는 돌아오지 않는다 — 시리즈째 담기는 유지된다', async () => {
    // given
    const series = await createSeriesId(8);
    const episodes = await publishEpisodes(series, [1, 2, 3]);
    const user = await createUser();
    await saveSeries(user, series, 1).expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .delete(path(`/contents/${episodes[2]}/save?client_seq=2`))
      .set('Authorization', user.auth)
      .expect(HttpStatus.OK);

    // when
    const seventh = await publishEpisode(series, 7);

    // then
    const ids = (await listLibrary(user)).map((item) => item.content.id);
    expect(ids[0]).toBe(seventh);
    expect(ids).not.toContain(episodes[2]);
    expect(ids).toHaveLength(3);
    expect((await getSeries(user, series)).is_saved).toBe(true);
  }, 60_000);

  it('A가 시리즈째 빼면 담긴 편이 전부 빠지고(편 해제 규칙) 8화가 들어오지 않는다', async () => {
    // given
    const series = await createSeriesId(8);
    await publishEpisodes(series, [1, 2]);
    const user = await createUser();
    await saveSeries(user, series, 1).expect(HttpStatus.OK);
    const before = await listLibrary(user);

    // when
    const removed = await request(app.getHttpServer())
      .delete(path(`/series/${series}/save?client_seq=9`))
      .set('Authorization', user.auth)
      .expect(HttpStatus.OK);
    const eighth = await publishEpisode(series, 8);

    // then
    const body = removed.body as UnsaveBody;
    expect(body.series_id).toBe(series);
    expect(body.client_seq).toBe(9);
    expect([...body.removed_item_ids].sort()).toEqual(
      before.map((item) => item.id).sort(),
    );
    expect(await listLibrary(user)).toHaveLength(0);
    expect((await getSeries(user, series)).is_saved).toBe(false);
    // 편 해제와 같다 — 영구 제외(unsave)·신호(unsave)가 편마다
    expect(await countSignals(user.userId, 'unsave')).toBe(2);
    expect(await countExclusions(user.userId, 'unsave')).toBe(2);
    expect(await countLibraryRows(user.userId, eighth)).toBe(0);

    // 다시 보내도 200 — 뺄 것이 없고 제외·신호가 늘지 않는다
    const again = await request(app.getHttpServer())
      .delete(path(`/series/${series}/save?client_seq=10`))
      .set('Authorization', user.auth)
      .expect(HttpStatus.OK);
    expect((again.body as UnsaveBody).removed_item_ids).toEqual([]);
    expect(await countSignals(user.userId, 'unsave')).toBe(2);
  }, 60_000);

  it('빼기 응답의 removed_item_ids 로 실행 취소하면 목록(자리·순서 포함)이 빼기 전과 같고 is_saved 가 true 다', async () => {
    // given — 담은 뒤 재생 목록 순서를 정해 둔다(복구가 자리를 되살리는지 본다)
    const series = await createSeriesId(8);
    await publishEpisodes(series, [1, 2, 3]);
    const user = await createUser();
    await saveSeries(user, series, 1).expect(HttpStatus.OK);
    const saved = await listLibrary(user);
    await request(app.getHttpServer())
      .put(path('/users/me/library-items/queue-order'))
      .set('Authorization', user.auth)
      .send({ item_ids: [saved[2].id, saved[0].id, saved[1].id] })
      .expect((response) => {
        expect(response.status).toBeLessThan(300);
      });
    const beforeAdded = await listLibrary(user);
    const beforeQueue = await listLibrary(user, 'queue');
    const followedAt = await librarySeriesAddedAt(user.userId, series);
    const removed = await request(app.getHttpServer())
      .delete(path(`/series/${series}/save?client_seq=2`))
      .set('Authorization', user.auth)
      .expect(HttpStatus.OK);

    // when
    const restored = await request(app.getHttpServer())
      .post(path(`/series/${series}/restore`))
      .set('Authorization', user.auth)
      .send({ item_ids: (removed.body as UnsaveBody).removed_item_ids })
      .expect(HttpStatus.OK);

    // then
    const body = restored.body as RestoreBody;
    expect(body.is_saved).toBe(true);
    expect([...body.restored_item_ids].sort()).toEqual(
      beforeAdded.map((item) => item.id).sort(),
    );
    expect(await listLibrary(user)).toEqual(beforeAdded);
    expect(await listLibrary(user, 'queue')).toEqual(beforeQueue);
    expect((await getSeries(user, series)).is_saved).toBe(true);
    // 되살린 시리즈째 담기의 적립 시각은 그대로다(새 담기가 아니다)
    expect(await librarySeriesAddedAt(user.userId, series)).toEqual(followedAt);
  }, 60_000);

  it('실행 취소는 남의 항목·다른 시리즈 편을 무시한다', async () => {
    // given
    const seriesX = await createSeriesId(3);
    const seriesY = await createSeriesId(3);
    await publishEpisodes(seriesX, [1]);
    const [yFirst] = await publishEpisodes(seriesY, [1]);
    const owner = await createUser();
    const stranger = await createUser();
    await saveSeries(owner, seriesX, 1).expect(HttpStatus.OK);
    const strangerItem = await saveEpisode(stranger, yFirst);
    await request(app.getHttpServer())
      .delete(path(`/contents/${yFirst}/save?client_seq=2`))
      .set('Authorization', stranger.auth)
      .expect(HttpStatus.OK);
    const removed = await request(app.getHttpServer())
      .delete(path(`/series/${seriesX}/save?client_seq=2`))
      .set('Authorization', owner.auth)
      .expect(HttpStatus.OK);
    const ownerItem = (removed.body as UnsaveBody).removed_item_ids[0];

    // when — 남의 항목(다른 시리즈 편이기도 하다)을 섞어 보낸다
    const restored = await request(app.getHttpServer())
      .post(path(`/series/${seriesX}/restore`))
      .set('Authorization', owner.auth)
      .send({ item_ids: [ownerItem, strangerItem] })
      .expect(HttpStatus.OK);

    // then
    expect((restored.body as RestoreBody).restored_item_ids).toEqual([
      ownerItem,
    ]);
    expect(await listLibrary(stranger)).toHaveLength(0);
  }, 60_000);

  it('새 편은 같은 시장 사용자만 받는다 — 시장을 바꾼 사용자는 이전 시장 시리즈의 새 편을 받지 않는다', async () => {
    // given — 둘 다 KR 에서 시리즈째 담았고, 하나는 그 뒤 GLOBAL 로 바꿨다
    const series = await createSeriesId(3);
    await publishEpisodes(series, [1]);
    const stay = await createUser();
    const moved = await createUser();
    await saveSeries(stay, series, 1).expect(HttpStatus.OK);
    await saveSeries(moved, series, 1).expect(HttpStatus.OK);
    await dataSource.query(`UPDATE users SET market = $1 WHERE id = $2`, [
      UserMarket.GLOBAL,
      moved.userId,
    ]);

    // when
    const second = await publishEpisode(series, 2, 3);

    // then
    expect(await countLibraryRows(stay.userId, second)).toBe(1);
    expect(await countLibraryRows(moved.userId, second)).toBe(0);
  }, 60_000);

  it('다른 시장 시리즈·없는 시리즈는 담기 404 · 빼기는 없는 시리즈만 404 · 순번 누락은 400', async () => {
    // given
    const series = await createSeriesId(3);
    await publishEpisodes(series, [1]);
    const globalUser = await createUser(UserRole.USER, UserMarket.GLOBAL);
    const missing = '00000000-0000-4000-8000-000000000000';

    // then
    const otherMarket = await saveSeries(globalUser, series, 1).expect(
      HttpStatus.NOT_FOUND,
    );
    expect((otherMarket.body as { error_code: string }).error_code).toBe(
      ErrorCode.NOT_FOUND,
    );
    expect(await countLibrarySeries(globalUser.userId, series)).toBe(0);
    await saveSeries(globalUser, missing, 1).expect(HttpStatus.NOT_FOUND);
    await request(app.getHttpServer())
      .delete(path(`/series/${missing}/save?client_seq=1`))
      .set('Authorization', globalUser.auth)
      .expect(HttpStatus.NOT_FOUND);
    await request(app.getHttpServer())
      .post(path(`/series/${missing}/restore`))
      .set('Authorization', globalUser.auth)
      .send({ item_ids: [] })
      .expect(HttpStatus.NOT_FOUND);
    await request(app.getHttpServer())
      .post(path(`/series/${series}/save`))
      .set('Authorization', globalUser.auth)
      .send({})
      .expect(HttpStatus.BAD_REQUEST);
    await request(app.getHttpServer())
      .delete(path(`/series/${series}/save`))
      .set('Authorization', globalUser.auth)
      .expect(HttpStatus.BAD_REQUEST);
  }, 60_000);

  it('회수 복구는 새 공개가 아니다 — 회수된 사이 시리즈째 담은 사용자에게 복구된 편이 들어오지 않는다', async () => {
    // given — 2화를 회수한 뒤 시리즈째 담는다(노출 편 1화만 담긴다)
    const series = await createSeriesId(3);
    const [, second] = await publishEpisodes(series, [1, 2]);
    await request(app.getHttpServer())
      .post(path(`/admin/contents/${second}/withdraw`))
      .set('Authorization', admin.auth)
      .send({})
      .expect(HttpStatus.OK);
    const user = await createUser();
    await saveSeries(user, series, 1).expect(HttpStatus.OK);

    // when
    await request(app.getHttpServer())
      .post(path(`/admin/contents/${second}/restore`))
      .set('Authorization', admin.auth)
      .expect(HttpStatus.OK);

    // then
    expect(await countLibraryRows(user.userId, second)).toBe(0);
  }, 60_000);

  it('탈퇴하면 시리즈째 담기 기록이 즉시 파기된다', async () => {
    // given
    const series = await createSeriesId(3);
    await publishEpisodes(series, [1]);
    const user = await createUser();
    await saveSeries(user, series, 1).expect(HttpStatus.OK);
    expect(await countLibrarySeries(user.userId, series)).toBe(1);

    // when
    await request(app.getHttpServer())
      .post(path('/users/me/withdraw'))
      .set('Authorization', user.auth)
      .set('Idempotency-Key', `${STAMP}-withdraw`)
      .send({ confirm: true })
      .expect(HttpStatus.NO_CONTENT);

    // then
    expect(await countLibrarySeries(user.userId, series)).toBe(0);
    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM users WHERE id = $1`,
      [user.userId],
    );
    expect(count).toBe(0);
  }, 60_000);

  // ── 도우미 ──────────────────────────────────────────────────────────

  function saveSeries(actor: Actor, seriesId: string, clientSeq: number) {
    return request(app.getHttpServer())
      .post(path(`/series/${seriesId}/save`))
      .set('Authorization', actor.auth)
      .send({ client_seq: clientSeq });
  }

  async function saveEpisode(actor: Actor, contentId: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(path(`/contents/${contentId}/save`))
      .set('Authorization', actor.auth)
      .send({ client_seq: 1 })
      .expect((res) => {
        expect([HttpStatus.OK, HttpStatus.CREATED]).toContain(res.status);
      });
    return (response.body as { library_item: { id: string } }).library_item.id;
  }

  async function getSeries(
    actor: Actor,
    seriesId: string,
  ): Promise<{ is_saved: boolean }> {
    const response = await request(app.getHttpServer())
      .get(path(`/series/${seriesId}`))
      .set('Authorization', actor.auth)
      .expect(HttpStatus.OK);
    return (response.body as { series: { is_saved: boolean } }).series;
  }

  async function listLibrary(
    actor: Actor,
    sort: 'added_desc' | 'queue' = 'added_desc',
  ): Promise<LibraryListBody['items']> {
    const response = await request(app.getHttpServer())
      .get(path(`/users/me/library-items?sort=${sort}&limit=50`))
      .set('Authorization', actor.auth)
      .expect(HttpStatus.OK);
    return (response.body as LibraryListBody).items.map((item) => ({
      id: item.id,
      source: item.source,
      added_at: item.added_at,
      content: { id: item.content.id },
    }));
  }

  async function countLibrarySeries(
    userId: string,
    seriesId: string,
  ): Promise<number> {
    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM library_series WHERE user_id = $1 AND series_id = $2`,
      [userId, seriesId],
    );
    return count;
  }

  async function librarySeriesAddedAt(
    userId: string,
    seriesId: string,
  ): Promise<Date> {
    const [{ added_at }] = await dataSource.query<{ added_at: Date }[]>(
      `SELECT added_at FROM library_series WHERE user_id = $1 AND series_id = $2`,
      [userId, seriesId],
    );
    return added_at;
  }

  /** 삭제분 포함 — "행이 아예 없다"를 본다 */
  async function countLibraryRows(
    userId: string,
    contentId: string,
  ): Promise<number> {
    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM library_items WHERE user_id = $1 AND content_id = $2`,
      [userId, contentId],
    );
    return count;
  }

  async function countSignals(
    userId: string,
    action: string,
    contentId?: string,
  ): Promise<number> {
    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM user_signals
        WHERE user_id = $1 AND action = $2 AND ($3::uuid IS NULL OR content_id = $3)`,
      [userId, action, contentId ?? null],
    );
    return count;
  }

  async function countExclusions(
    userId: string,
    reason: string,
  ): Promise<number> {
    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM drip_excluded_contents WHERE user_id = $1 AND reason = $2`,
      [userId, reason],
    );
    return count;
  }

  async function createSeriesId(totalEpisodes: number): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(path('/admin/series'))
      .set('Authorization', admin.auth)
      .send({
        title: `${STAMP} 시리즈 ${seriesIds.length}`,
        description: '소개',
        total_episodes: totalEpisodes,
      })
      .expect(HttpStatus.CREATED);
    const id = (response.body as { id: string }).id;
    seriesIds.push(id);
    return id;
  }

  async function publishEpisodes(
    seriesId: string,
    episodeNos: number[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const episodeNo of episodeNos) {
      ids.push(await publishEpisode(seriesId, episodeNo));
    }
    return ids;
  }

  /** 관리자 업로드로 발행한다(적립 훅이 이 경로에 있다). 발행 시각은 과거로 옮긴다 — 위 설명 참고 */
  async function publishEpisode(
    seriesId: string,
    episodeNo: number,
    totalEpisodes?: number,
  ): Promise<string> {
    const total =
      totalEpisodes ??
      (
        await dataSource.query<{ total_episodes: number }[]>(
          `SELECT total_episodes FROM series WHERE id = $1`,
          [seriesId],
        )
      )[0].total_episodes;
    const response = await request(app.getHttpServer())
      .post(path('/admin/contents'))
      .set('Authorization', admin.auth)
      .field(
        'payload',
        JSON.stringify({
          title: `${STAMP} 편 ${episodeNo}`,
          description: 'e2e 전용',
          origin: 'ai_generated',
          source_name: '참고한 자료: E2E',
          topic_ids: [topic.id],
          sources: [{ title: 'E2E 소스' }],
          review_confirmed: true,
          market: 'kr',
          language: 'ko',
          series_id: seriesId,
          episode_no: episodeNo,
          total_episodes: total,
        }),
      )
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'ep.mp3',
        contentType: 'audio/mpeg',
      })
      .attach('thumbnail', Buffer.from('fake-image'), {
        filename: 'thumb.png',
        contentType: 'image/png',
      })
      .expect(HttpStatus.CREATED);
    const id = (response.body as { id: string }).id;
    await dataSource.query(
      `UPDATE contents SET published_at = $1 WHERE id = $2`,
      [PAST, id],
    );
    return id;
  }

  async function createUser(
    role: UserRole = UserRole.USER,
    market: UserMarket = UserMarket.KR,
  ): Promise<Actor> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-${++userCount}`,
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
});
