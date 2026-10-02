import 'dotenv/config';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import {
  toServiceDate,
  toServiceDayRange,
} from '@/common/utils/service-date.util';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { SocialProvider } from '@/modules/user/user.enum';

interface SignUpBody {
  status: string;
  access_token: string;
  user: { id: string };
}
interface LoginBody {
  status: string;
  signup_token?: string;
  access_token?: string;
}
interface PromptBody {
  show: boolean;
  placed_date: string | null;
  muted_until: string | null;
  items: { content_id: string; placed_date: string; source: string }[];
}
interface VersionsBody {
  items: {
    algorithm_version: string | null;
    placements: number;
    ratings: number;
    average_stars: number | null;
    distribution: Record<string, number>;
  }[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * 추천 별점(온라인 평가) E2E — `drip-feedback.md` 8장 완료 조건을 실제 DB 위에서 밟는다.
 *
 * 편성분은 배치를 돌리지 않고 `library_items`에 직접 넣는다(출처 drip·적립 시각·알고리즘 버전). 검증 대상은 배치가
 * 아니라 "그 편성분에 대해 언제 묻고, 별점이 어느 버전에 쌓이는가"이기 때문이다.
 */
describe('추천 별점 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const now = new Date();
  // 서비스 날짜 기준 어제 04:05 KST · 3일 전 04:05 KST · 10일 전(접수 기간 밖)
  const placedAt = (daysAgo: number) =>
    new Date(
      toServiceDayRange(
        new Date(now.getTime() - daysAgo * DAY),
      ).start.getTime() +
        5 * 60 * 1000,
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    await seedContents(4);
  }, 60_000);

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-df-%'`,
    );
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    await app.close();
  }, 60_000);

  it('가장 최근 편성분 2편을 한 번에 묻고, 별점은 편성 시점의 알고리즘 버전에 쌓이며, 같은 편성분은 다시 묻지 않는다', async () => {
    // given — 3일 전(v0) 2편 + 어제(v1) 2편 편성
    const { userId, auth, providerToken } = await createUser('rating');
    await place(userId, [contentIds[0], contentIds[1]], placedAt(3), 'e2e-v0');
    await place(userId, [contentIds[2], contentIds[3]], placedAt(1), 'e2e-v1');

    // when / then — 팝업은 쌓인 날짜마다가 아니라 마지막 편성분(어제) 하나를 묻는다
    const prompt = await get('/users/me/drip-feedback/prompt', auth).expect(
      HttpStatus.OK,
    );
    const promptBody = prompt.body as PromptBody;
    expect(promptBody.show).toBe(true);
    expect(promptBody.placed_date).toBe(toServiceDate(placedAt(1)));
    expect(promptBody.items.map((item) => item.content_id).sort()).toEqual(
      [contentIds[2], contentIds[3]].sort(),
    );
    expect(promptBody.items.every((item) => item.source === 'drip')).toBe(true);

    // 두 편을 한 번에 평가
    await post('/users/me/drip-feedback', auth, {
      ratings: [
        { content_id: contentIds[2], stars: 5 },
        { content_id: contentIds[3], stars: 3 },
      ],
    }).expect(HttpStatus.NO_CONTENT);

    // 같은 편성분은 다시 묻지 않는다
    const after = await get('/users/me/drip-feedback/prompt', auth).expect(
      HttpStatus.OK,
    );
    expect((after.body as PromptBody).show).toBe(false);

    // 버전이 바뀐 뒤(현재 v1)에 옛 편성분(v0, 3일 전 — 접수 기간 안)을 평가하면 v0에 쌓인다
    await post('/users/me/drip-feedback', auth, {
      ratings: [{ content_id: contentIds[0], stars: 1 }],
    }).expect(HttpStatus.NO_CONTENT);

    // 같은 콘텐츠 재전송은 덮어쓴다(멱등)
    await post('/users/me/drip-feedback', auth, {
      ratings: [{ content_id: contentIds[3], stars: 4 }],
    }).expect(HttpStatus.NO_CONTENT);

    // 편성분이 아닌 콘텐츠·접수 기간 밖은 전부 거부
    const outside = await createUser('outside');
    const rejected = await post('/users/me/drip-feedback', outside.auth, {
      ratings: [{ content_id: contentIds[2], stars: 5 }],
    }).expect(HttpStatus.BAD_REQUEST);
    expect(rejected.body).toMatchObject({
      error_code: ErrorCode.DRIP_FEEDBACK_NOT_RATEABLE,
    });

    // 어드민 버전 표 — 관리자로 승격한 뒤 새 토큰으로 조회한다(역할은 토큰 발급 시점의 값)
    await dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
      userId,
    ]);
    const adminAuth = await reLogin(providerToken);
    const versions = await get(
      '/admin/drip-feedback/versions',
      adminAuth,
    ).expect(HttpStatus.OK);
    const rows = (versions.body as VersionsBody).items;
    const v1 = rows.find((row) => row.algorithm_version === 'e2e-v1');
    const v0 = rows.find((row) => row.algorithm_version === 'e2e-v0');
    expect(v1).toMatchObject({ placements: 2, ratings: 2, average_stars: 4.5 });
    expect(v1?.distribution).toMatchObject({ '4': 1, '5': 1 });
    expect(v0).toMatchObject({ placements: 2, ratings: 1, average_stars: 1 });
    // 버전 역순 — v1 이 v0 보다 앞
    expect(rows.findIndex((row) => row === v1)).toBeLessThan(
      rows.findIndex((row) => row === v0),
    );
  }, 60_000);

  it('닫기는 그 편성분을 다시 묻지 않게 하고, 새 편성분이 생기면 다시 묻는다', async () => {
    const { userId, auth } = await createUser('dismiss');
    await place(userId, [contentIds[0]], placedAt(2), 'e2e-v1');

    const first = (
      await get('/users/me/drip-feedback/prompt', auth).expect(HttpStatus.OK)
    ).body as PromptBody;
    expect(first.show).toBe(true);

    await post('/users/me/drip-feedback/dismiss', auth, {
      placed_date: first.placed_date,
    }).expect(HttpStatus.NO_CONTENT);

    const closed = (
      await get('/users/me/drip-feedback/prompt', auth).expect(HttpStatus.OK)
    ).body as PromptBody;
    expect(closed.show).toBe(false);

    // 새 편성(어제)이 생기면 그것을 묻는다
    await place(userId, [contentIds[1]], placedAt(1), 'e2e-v1');
    const again = (
      await get('/users/me/drip-feedback/prompt', auth).expect(HttpStatus.OK)
    ).body as PromptBody;
    expect(again.show).toBe(true);
    expect(again.items.map((item) => item.content_id)).toEqual([contentIds[1]]);
  }, 60_000);

  it('이번 주 그만 보기 — 종료 라벨을 돌려주고 그때까지 묻지 않는다', async () => {
    const { userId, auth } = await createUser('mute');
    await place(userId, [contentIds[2]], placedAt(1), 'e2e-v1');

    const muted = await post('/users/me/drip-feedback/mute', auth, {}).expect(
      HttpStatus.OK,
    );
    expect(muted.body).toEqual({
      muted_until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
    });

    const prompt = (
      await get('/users/me/drip-feedback/prompt', auth).expect(HttpStatus.OK)
    ).body as PromptBody;
    expect(prompt.show).toBe(false);
    expect(prompt.muted_until).toBe(
      (muted.body as { muted_until: string }).muted_until,
    );
  }, 60_000);

  it('가장 최근 편성분을 전부 지웠으면 그 전 편성분으로 거슬러 올라가 묻지 않는다', async () => {
    const { userId, auth } = await createUser('deleted');
    // 3일 전 편성분은 아직 묻지 않았고, 어제 편성분은 받자마자 지웠다
    await place(userId, [contentIds[0]], placedAt(3), 'e2e-v1');
    await place(userId, [contentIds[1]], placedAt(1), 'e2e-v1');
    await dataSource
      .getRepository(LibraryItem)
      .softDelete({ userId, contentId: contentIds[1] });

    const prompt = (
      await get('/users/me/drip-feedback/prompt', auth).expect(HttpStatus.OK)
    ).body as PromptBody;

    expect(prompt.show).toBe(false);
    expect(prompt.items).toEqual([]);
    expect(prompt.placed_date).toBe(toServiceDate(placedAt(1)));
  }, 60_000);

  it('온보딩 직후의 첫 드립(알고리즘 버전 없음)만 받은 사용자는 묻지 않는다', async () => {
    const { userId, auth } = await createUser('firstdrip');
    await place(userId, [contentIds[0], contentIds[1]], placedAt(1), null);

    const prompt = (
      await get('/users/me/drip-feedback/prompt', auth).expect(HttpStatus.OK)
    ).body as PromptBody;

    expect(prompt).toEqual({
      show: false,
      placed_date: null,
      muted_until: null,
      items: [],
    });
  }, 60_000);

  it('접수 기간(7일)을 지난 편성분은 묻지 않는다', async () => {
    const { userId, auth } = await createUser('stale');
    await place(userId, [contentIds[0]], placedAt(9), 'e2e-v1');

    const prompt = (
      await get('/users/me/drip-feedback/prompt', auth).expect(HttpStatus.OK)
    ).body as PromptBody;

    expect(prompt.show).toBe(false);
    expect(prompt.items).toEqual([]);
  }, 60_000);

  it('같은 콘텐츠가 두 번 든 별점과 달력에 없는 닫기 날짜는 400 으로 거절한다', async () => {
    const { userId, auth } = await createUser('invalid');
    await place(userId, [contentIds[0]], placedAt(1), 'e2e-v1');

    const duplicated = await post('/users/me/drip-feedback', auth, {
      ratings: [
        { content_id: contentIds[0], stars: 5 },
        { content_id: contentIds[0], stars: 1 },
      ],
    }).expect(HttpStatus.BAD_REQUEST);
    expect(duplicated.body).toMatchObject({
      error_code: ErrorCode.VALIDATION_FAILED,
    });

    const badDate = await post('/users/me/drip-feedback/dismiss', auth, {
      placed_date: '2026-13-45',
    }).expect(HttpStatus.BAD_REQUEST);
    expect(badDate.body).toMatchObject({
      error_code: ErrorCode.VALIDATION_FAILED,
    });
  }, 60_000);

  it('편성분이 없는 사용자는 묻지 않는다', async () => {
    const { auth } = await createUser('none');

    const prompt = (
      await get('/users/me/drip-feedback/prompt', auth).expect(HttpStatus.OK)
    ).body as PromptBody;
    expect(prompt).toEqual({
      show: false,
      placed_date: null,
      muted_until: null,
      items: [],
    });
  }, 60_000);

  // --- helpers ---

  const path = (suffix: string) => `/api/v1${suffix}`;
  const get = (suffix: string, auth: string) =>
    request(app.getHttpServer()).get(path(suffix)).set('Authorization', auth);
  const post = (suffix: string, auth: string, body: object) =>
    request(app.getHttpServer())
      .post(path(suffix))
      .set('Authorization', auth)
      .send(body);

  async function createUser(
    label: string,
  ): Promise<{ userId: string; auth: string; providerToken: string }> {
    const providerToken = `e2e-df-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const deviceId = `e2e-df-device-${label}`;
    const login = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: deviceId,
      })
      .expect(HttpStatus.OK);
    const loginBody = login.body as LoginBody;
    const signUp = await request(app.getHttpServer())
      .post(path('/auth/sign-up'))
      .set('Idempotency-Key', `e2e-df-signup-${providerToken}`)
      .send({
        signup_token: loginBody.signup_token,
        device_id: deviceId,
        consents: [
          { consent_type: 'terms', version: '0.1', is_agreed: true },
          { consent_type: 'privacy', version: '0.1', is_agreed: true },
          { consent_type: 'age_confirmation', version: null, is_agreed: true },
        ],
      })
      .expect(HttpStatus.CREATED);
    const signUpBody = signUp.body as SignUpBody;
    userIds.push(signUpBody.user.id);

    return {
      userId: signUpBody.user.id,
      auth: `Bearer ${signUpBody.access_token}`,
      providerToken,
    };
  }

  async function reLogin(providerToken: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: 'e2e-df-device-relogin',
      })
      .expect(HttpStatus.OK);

    return `Bearer ${(response.body as LoginBody).access_token}`;
  }

  /** 편성 배치가 남기는 것과 같은 행 — 출처 drip, 적립 시각, 알고리즘 버전 */
  async function place(
    userId: string,
    ids: string[],
    addedAt: Date,
    // null = 온보딩 직후의 첫 드립(버전을 찍지 않는 경로)
    algorithmVersion: string | null,
  ): Promise<void> {
    const repository = dataSource.getRepository(LibraryItem);
    await repository.save(
      ids.map((contentId) =>
        repository.create({
          userId,
          contentId,
          source: LibraryItemSource.DRIP,
          status: LibraryItemStatus.UNPLAYED,
          addedAt,
          algorithmVersion,
        }),
      ),
    );
  }

  async function seedContents(count: number): Promise<void> {
    const repository = dataSource.getRepository(Content);

    for (let index = 0; index < count; index += 1) {
      const content = await repository.save(
        repository.create({
          title: `E2E 별점 콘텐츠 ${index}`,
          description: 'e2e 전용',
          authorName: '테스트',
          sourceName: 'E2E',
          sourceUrl: 'https://example.com/e2e',
          origin: ContentOrigin.AI_GENERATED,
          partnerId: null,
          seriesId: null,
          episodeNo: null,
          totalEpisodes: null,
          audioPath: `e2e-df/${index}.mp3`,
          durationSec: 600,
          thumbnailUrl: 'https://example.com/e2e.png',
          contentVersion: 1,
          licenseExpiresAt: null,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(now.getTime() - (index + 1) * 60_000),
          withdrawnAt: null,
        }),
      );
      contentIds.push(content.id);
    }
  }
});
