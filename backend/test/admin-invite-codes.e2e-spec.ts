import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { InviteCodeRedemption } from '@/modules/subscription/entities/invite-code-redemption.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserRole, UserTier } from '@/modules/user/user.enum';

interface ItemBody {
  id: string;
  code: string;
  name: string;
  tier: string;
  grant_days: number | null;
  grant_until_date: string | null;
  max_redemptions: number | null;
  redeemed_count: number;
  active_count: number | null;
  is_active: boolean;
}

/**
 * 초대 코드 관리 E2E(`admin-api.md` 4.23) — 만들기(자동·직접 코드)·중복·기간 규칙·목록의 사용 현황·고치기 범위·감사 로그·권한.
 */
describe('초대 코드 관리 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const codeIds: string[] = [];
  const RUN = Date.now().toString(36).toUpperCase();
  const path = (p: string) => `/api/v1${p}`;

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
  }, 60_000);

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const codeId of codeIds) {
      await dataSource.query(`DELETE FROM invite_codes WHERE id = $1`, [
        codeId,
      ]);
      await dataSource.query(`DELETE FROM audit_logs WHERE target = $1`, [
        `invite_code:${codeId}`,
      ]);
    }
    await app.close();
  }, 60_000);

  it('만들고·목록에서 사용 현황을 보고·앞으로의 입력에 관한 값만 고치며, 쓰기마다 감사 로그가 남는다', async () => {
    const { auth: adminAuth } = await createUser('admin', UserRole.ADMIN);

    // 만들기 — 코드를 비우면 서버가 만든다, 직접 준 값은 대문자로
    const generated = await create(adminAuth, {
      name: '산군 PoC',
      tier: UserTier.PRO,
      grant_days: 30,
      max_redemptions: 50,
    }).expect(HttpStatus.CREATED);
    const given = await create(adminAuth, {
      code: `daily-${RUN}`,
      name: '다른 PoC',
      tier: UserTier.DAILY,
      grant_until_date: '2026-12-31',
    }).expect(HttpStatus.CREATED);
    const proCode = generated.body as ItemBody;
    const dailyCode = given.body as ItemBody;
    codeIds.push(proCode.id, dailyCode.id);
    expect(proCode).toMatchObject({
      tier: UserTier.PRO,
      grant_days: 30,
      max_redemptions: 50,
      redeemed_count: 0,
      is_active: true,
    });
    expect(proCode.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(dailyCode.code).toBe(`DAILY-${RUN}`);
    expect(dailyCode.grant_until_date).toBe('2026-12-31');

    // 중복 409 · 기간 둘 다/둘 다 없음 400 · 무료 티어 400
    await create(adminAuth, {
      code: `DAILY-${RUN}`,
      name: '중복',
      tier: UserTier.PRO,
      grant_days: 7,
    }).expect(HttpStatus.CONFLICT);
    await create(adminAuth, {
      name: '둘 다',
      tier: UserTier.PRO,
      grant_days: 7,
      grant_until_date: '2026-12-31',
    }).expect(HttpStatus.BAD_REQUEST);
    await create(adminAuth, { name: '없음', tier: UserTier.PRO }).expect(
      HttpStatus.BAD_REQUEST,
    );
    await create(adminAuth, {
      name: '무료',
      tier: UserTier.LIGHT,
      grant_days: 7,
    }).expect(HttpStatus.BAD_REQUEST);
    // 지난 마지막 날 · 시간대 없는 시각 · 한도 상한 초과는 400(500 이 아니다)
    await create(adminAuth, {
      name: '지난 날',
      tier: UserTier.PRO,
      grant_until_date: '2020-01-01',
    }).expect(HttpStatus.BAD_REQUEST);
    await create(adminAuth, {
      name: '시간대 없음',
      tier: UserTier.PRO,
      grant_days: 7,
      redeemable_until: '2026-12-01T10:00:00',
    }).expect(HttpStatus.BAD_REQUEST);
    await create(adminAuth, {
      name: '한도 초과',
      tier: UserTier.PRO,
      grant_days: 7,
      max_redemptions: 10_000_000_000,
    }).expect(HttpStatus.BAD_REQUEST);

    // 목록 — 지급 중 1명이 사용 현황에 잡힌다(사용자 정보는 없다)
    const { userId: listenerId } = await createUser('listener', UserRole.USER);
    await dataSource.getRepository(InviteCodeRedemption).save({
      inviteCodeId: proCode.id,
      userId: listenerId,
      tier: UserTier.PRO,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 86_400_000),
    });
    await dataSource.query(
      `UPDATE invite_codes SET redeemed_count = 1 WHERE id = $1`,
      [proCode.id],
    );
    const list = await request(app.getHttpServer())
      .get(path('/admin/invite-codes'))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    expect(list.headers['cache-control']).toBe('no-store');
    const listed = (list.body as { items: ItemBody[] }).items.find(
      (item) => item.id === proCode.id,
    );
    expect(listed).toMatchObject({ redeemed_count: 1, active_count: 1 });
    expect(JSON.stringify(list.body)).not.toMatch(/"email"|"nickname"|user_id/);

    // 고치기 — 끄기·한도 해제는 되고, 지급 요금제는 받지 않는다(400)
    const patched = await request(app.getHttpServer())
      .patch(path(`/admin/invite-codes/${proCode.id}`))
      .set('Authorization', adminAuth)
      .send({ is_active: false, max_redemptions: null })
      .expect(HttpStatus.OK);
    expect(patched.body).toMatchObject({
      is_active: false,
      max_redemptions: null,
      tier: UserTier.PRO,
      grant_days: 30,
    });
    await request(app.getHttpServer())
      .patch(path(`/admin/invite-codes/${proCode.id}`))
      .set('Authorization', adminAuth)
      .send({ tier: UserTier.DAILY })
      .expect(HttpStatus.BAD_REQUEST);
    await request(app.getHttpServer())
      .patch(path(`/admin/invite-codes/${proCode.id}`))
      .set('Authorization', adminAuth)
      .send({ is_active: null })
      .expect(HttpStatus.BAD_REQUEST);

    // 감사 로그 — 만들기 1 · 고치기 1
    const audits: { action: string }[] = await dataSource.query(
      `SELECT action FROM audit_logs WHERE target = $1 ORDER BY created_at`,
      [`invite_code:${proCode.id}`],
    );
    expect(audits.map((row) => row.action)).toEqual([
      'invite_code.create',
      'invite_code.update',
    ]);
  }, 60_000);

  it('관리자가 아니면 403, 토큰이 없으면 401이다', async () => {
    const { auth } = await createUser('plain', UserRole.USER);

    await request(app.getHttpServer())
      .get(path('/admin/invite-codes'))
      .set('Authorization', auth)
      .expect(HttpStatus.FORBIDDEN);
    await request(app.getHttpServer())
      .get(path('/admin/invite-codes'))
      .expect(HttpStatus.UNAUTHORIZED);
  }, 60_000);

  function create(auth: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(path('/admin/invite-codes'))
      .set('Authorization', auth)
      .send(body);
  }

  async function createUser(
    label: string,
    role: UserRole,
  ): Promise<{ userId: string; auth: string }> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `e2e-invite-admin-${RUN}-${label}`,
        role,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);
    const token = app
      .get(JwtService)
      .sign({ sub: user.id, role, typ: 'access' }, { expiresIn: 600 });
    return { userId: user.id, auth: `Bearer ${token}` };
  }
});
