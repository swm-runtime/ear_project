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
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserRole } from '@/modules/user/user.enum';

interface ListBody {
  items: {
    id: string;
    title: string;
    is_pinned: boolean;
    published_at: string;
  }[];
  next_cursor: string | null;
}

/**
 * KAN-67 — 공지사항 조회 2건 + 관리자 관리 4건을 HTTP 로 끝까지 본다(티켓 완료 조건).
 *
 * **공유 로컬 DB라 다른 공지가 있을 수 있다.** 그래서 목록 검증은 이 테스트가 만든 공지만 골라 본다.
 * 끝나면 만든 공지·사용자·감사 로그를 지운다.
 */
describe('공지사항 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAuth: string;
  let userAuth: string;

  const TITLE_PREFIX = `E2E-NOTICE-${Date.now()}`;
  const userIds: string[] = [];
  const noticeIds: string[] = [];

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
    adminAuth = await createUser('admin', UserRole.ADMIN);
    userAuth = await createUser('user', UserRole.USER);
  }, 60_000);

  afterAll(async () => {
    for (const id of noticeIds) {
      await dataSource.query(`DELETE FROM audit_logs WHERE target = $1`, [
        `notice:${id}`,
      ]);
      await dataSource.query(`DELETE FROM notices WHERE id = $1`, [id]);
    }
    for (const id of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    await app.close();
  }, 60_000);

  it('발행 공지는 고정이 먼저·나머지는 최신순이고, 초안·예약은 보이지 않는다', async () => {
    // given — 발행 3건(고정 1) + 초안 1 + 예약 1
    const old = await createNotice('old', { published_at: hoursAgo(3) });
    const pinned = await createNotice('pinned', {
      published_at: hoursAgo(5),
      is_pinned: true,
    });
    const recent = await createNotice('recent', { published_at: hoursAgo(1) });
    const draft = await createNotice('draft', {});
    const scheduled = await createNotice('scheduled', {
      published_at: new Date(Date.now() + 3_600_000).toISOString(),
    });

    // when
    const mine = (await listAll()).filter((item) =>
      item.title.startsWith(TITLE_PREFIX),
    );

    // then — 목록에 본문이 없다
    expect(mine.map((item) => item.id)).toEqual([pinned, recent, old]);
    expect(mine[0]).not.toHaveProperty('body');
    expect(mine.map((item) => item.id)).not.toContain(draft);
    expect(mine.map((item) => item.id)).not.toContain(scheduled);
  });

  it('커서로 이어 받으면 중복·누락이 없다', async () => {
    // given — 같은 발행 시각을 공유하는 21건(정렬 키가 같아도 id 로 갈린다)
    const at = hoursAgo(30);
    const created: string[] = [];
    for (let index = 0; index < 21; index++) {
      created.push(await createNotice(`page-${index}`, { published_at: at }));
    }

    // when
    const first = await get('/notices?limit=20', userAuth).expect(
      HttpStatus.OK,
    );
    const firstBody = first.body as ListBody;
    const collected = [...firstBody.items];
    let cursor = firstBody.next_cursor;
    while (cursor) {
      const next = await get(
        `/notices?limit=20&cursor=${encodeURIComponent(cursor)}`,
        userAuth,
      ).expect(HttpStatus.OK);
      const body = next.body as ListBody;
      collected.push(...body.items);
      cursor = body.next_cursor;
    }

    // then
    expect(firstBody.items).toHaveLength(20);
    const ids = collected.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(created));
  });

  it('상세는 본문을 주고, 초안·삭제·없는 공지는 404 NOTICE_NOT_FOUND 다', async () => {
    // given
    const published = await createNotice('detail', {
      published_at: hoursAgo(1),
    });
    const draft = await createNotice('detail-draft', {});
    const deleted = await createNotice('detail-deleted', {
      published_at: hoursAgo(1),
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/notices/${deleted}`)
      .set('Authorization', adminAuth)
      .expect(HttpStatus.NO_CONTENT);

    // when
    const detail = await get(`/notices/${published}`, userAuth).expect(
      HttpStatus.OK,
    );

    // then
    expect(detail.body).toMatchObject({
      id: published,
      body: '줄바꿈은\n그대로',
      is_pinned: false,
    });
    for (const id of [draft, deleted, '99999999-9999-4999-8999-999999999999']) {
      const response = await get(`/notices/${id}`, userAuth).expect(
        HttpStatus.NOT_FOUND,
      );
      expect(response.body).toMatchObject({
        error_code: ErrorCode.NOTICE_NOT_FOUND,
      });
    }
  });

  it('초안으로 만든 공지는 발행 시각을 과거로 PATCH 하면 보이고, null 로 되돌리면 사라진다', async () => {
    // given
    const id = await createNotice('publish-later', {});
    expect(await isListed(id)).toBe(false);

    // when
    await patchNotice(id, { published_at: hoursAgo(1) }).expect(HttpStatus.OK);

    // then
    expect(await isListed(id)).toBe(true);

    // when — 발행 취소
    const cancelled = await patchNotice(id, { published_at: null }).expect(
      HttpStatus.OK,
    );

    // then
    expect(cancelled.body).toMatchObject({ published_at: null });
    expect(await isListed(id)).toBe(false);
  });

  it('관리자 목록은 초안을 포함하고 감사 로그가 남는다', async () => {
    // given
    const draft = await createNotice('admin-list-draft', {});

    // when
    const response = await get('/admin/notices?limit=50', adminAuth).expect(
      HttpStatus.OK,
    );

    // then
    expect(
      (response.body as { items: { id: string }[] }).items.map(
        (item) => item.id,
      ),
    ).toContain(draft);
    const audits = await dataSource.query<{ action: string }[]>(
      `SELECT action FROM audit_logs WHERE target = $1`,
      [`notice:${draft}`],
    );
    expect(audits).toEqual([{ action: 'notice.create' }]);
  });

  it('관리자 목록도 커서로 끝까지 받으면 중복·누락이 없다 — 같은 밀리초에 만든 초안도 갈린다', async () => {
    // given — 연달아 만들어 created_at 이 거의 겹친다
    const created: string[] = [];
    for (let index = 0; index < 5; index++) {
      created.push(await createNotice(`admin-page-${index}`, {}));
    }

    // when — 한 건씩 넘긴다
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const suffix: string = cursor
        ? `&cursor=${encodeURIComponent(cursor)}`
        : '';
      const response = await get(
        `/admin/notices?limit=1${suffix}`,
        adminAuth,
      ).expect(HttpStatus.OK);
      const body = response.body as {
        items: { id: string }[];
        next_cursor: string | null;
      };
      ids.push(...body.items.map((item) => item.id));
      cursor = body.next_cursor;
    } while (cursor);

    // then
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(created));
  });

  it('제목 101자·공백 제목은 400, 일반 사용자는 관리자 API 에 403 이다', async () => {
    // when / then
    await request(app.getHttpServer())
      .post('/api/v1/admin/notices')
      .set('Authorization', adminAuth)
      .send({ title: 'a'.repeat(101), body: '본문' })
      .expect(HttpStatus.BAD_REQUEST);
    await request(app.getHttpServer())
      .post('/api/v1/admin/notices')
      .set('Authorization', adminAuth)
      .send({ title: '   ', body: '본문' })
      .expect(HttpStatus.BAD_REQUEST);
    await request(app.getHttpServer())
      .post('/api/v1/admin/notices')
      .set('Authorization', userAuth)
      .send({ title: '제목', body: '본문' })
      .expect(HttpStatus.FORBIDDEN);
  });

  it('관리자 입력이 잘못되면 500 이 아니라 400 이다', async () => {
    // given
    const id = await createNotice('invalid-input', {});
    const post = (body: object) =>
      request(app.getHttpServer())
        .post('/api/v1/admin/notices')
        .set('Authorization', adminAuth)
        .send({ title: `${TITLE_PREFIX}-x`, body: '본문', ...body });

    // when / then — NOT NULL 컬럼에 null
    for (const field of ['title', 'body', 'is_pinned']) {
      await patchNotice(id, { [field]: null }).expect(HttpStatus.BAD_REQUEST);
    }
    // JS Date 가 못 읽는 ISO 형식 · 오프셋 없는 시각(서버 시간대 해석) · 커서 범위 밖(2000년 이전)
    for (const publishedAt of [
      '2026-W38-4',
      '20260101',
      '2026-01-01T09:00',
      '1999-12-31T00:00:00Z',
    ]) {
      await post({ published_at: publishedAt }).expect(HttpStatus.BAD_REQUEST);
    }
    // 조합 이모지 — 검증기는 1자, DB 는 2자로 센다
    await post({ title: '❤️'.repeat(51) }).expect(HttpStatus.BAD_REQUEST);
    // 바꿀 키가 없는 PATCH
    await patchNotice(id, {}).expect(HttpStatus.BAD_REQUEST);
  });

  it('오프셋이 있는 발행 시각은 그 순간 그대로 저장된다', async () => {
    // when
    const id = await createNotice('offset', {
      published_at: '2026-01-01T09:00:00+09:00',
    });

    // then
    const detail = await get(`/notices/${id}`, userAuth).expect(HttpStatus.OK);
    expect((detail.body as { published_at: string }).published_at).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('uuid 가 아닌 id 는 없는 공지와 같이 404 다', async () => {
    // when
    const response = await get('/notices/abc', userAuth).expect(
      HttpStatus.NOT_FOUND,
    );

    // then
    expect(response.body).toMatchObject({
      error_code: ErrorCode.NOTICE_NOT_FOUND,
    });
    await patchNotice('abc', { title: '제목' }).expect(HttpStatus.NOT_FOUND);
  });

  it('깨진 커서는 400 NOTICE_CURSOR_INVALID 다', async () => {
    // when
    const response = await get('/notices?cursor=broken', userAuth).expect(
      HttpStatus.BAD_REQUEST,
    );

    // then
    expect(response.body).toMatchObject({
      error_code: ErrorCode.NOTICE_CURSOR_INVALID,
    });
  });

  // --- 헬퍼 ---

  const get = (path: string, auth: string) =>
    request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set('Authorization', auth);

  const patchNotice = (id: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1/admin/notices/${id}`)
      .set('Authorization', adminAuth)
      .send(body);

  function hoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 3_600_000).toISOString();
  }

  async function createNotice(
    label: string,
    fields: { published_at?: string; is_pinned?: boolean },
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/notices')
      .set('Authorization', adminAuth)
      .send({
        title: `${TITLE_PREFIX}-${label}`,
        body: '줄바꿈은\n그대로',
        ...fields,
      })
      .expect(HttpStatus.CREATED);
    const id = (response.body as { id: string }).id;
    noticeIds.push(id);

    return id;
  }

  async function listAll(): Promise<ListBody['items']> {
    const items: ListBody['items'] = [];
    let cursor: string | null = null;

    do {
      const suffix: string = cursor
        ? `&cursor=${encodeURIComponent(cursor)}`
        : '';
      const response = await get(`/notices?limit=50${suffix}`, userAuth).expect(
        HttpStatus.OK,
      );
      const body = response.body as ListBody;
      items.push(...body.items);
      cursor = body.next_cursor;
    } while (cursor);

    return items;
  }

  async function isListed(id: string): Promise<boolean> {
    return (await listAll()).some((item) => item.id === id);
  }

  async function createUser(label: string, role: UserRole): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `e2e-notice-${label}-${Date.now()}`,
        role,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);

    const token = app
      .get(JwtService)
      .sign(
        { sub: user.id, role: user.role, typ: 'access' },
        { expiresIn: 600 },
      );

    return `Bearer ${token}`;
  }
});
