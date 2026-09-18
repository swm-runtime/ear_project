import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { Topic } from '@/modules/interest/entities/topic.entity';

/**
 * 공개 주제 목록(public-api.md 2.1) — 로그인 없이 부르고, 숨긴 주제는 나오지 않는다.
 * 공유 로컬 DB라 다른 주제가 있을 수 있어 이 테스트가 만든 대분류만 골라 본다.
 */
describe('공개 주제 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const CATEGORY = `E2E-PUBLIC-${Date.now()}`;

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
    await dataSource.query(`DELETE FROM topics WHERE parent_category = $1`, [
      CATEGORY,
    ]);
    await app.close();
  }, 60_000);

  it('인증 없이 노출 중인 주제만 대분류별로 돌려준다', async () => {
    // given — 노출 2건(정렬 역순으로 저장) + 숨김 1건
    const repository = dataSource.getRepository(Topic);
    await repository.save([
      repository.create({
        name: `${CATEGORY}-second`,
        parentCategory: CATEGORY,
        isVisible: true,
        displayOrder: 971,
      }),
      repository.create({
        name: `${CATEGORY}-first`,
        parentCategory: CATEGORY,
        isVisible: true,
        displayOrder: 970,
      }),
      repository.create({
        name: `${CATEGORY}-hidden`,
        parentCategory: CATEGORY,
        isVisible: false,
        displayOrder: 972,
      }),
    ]);

    // when — Authorization 헤더 없이
    const response = await request(app.getHttpServer())
      .get('/api/v1/public/topics')
      .expect(HttpStatus.OK);

    // then
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    const group = (
      response.body as {
        groups: { name: string; topics: { name: string }[] }[];
      }
    ).groups.find((g) => g.name === CATEGORY);
    expect(group).toEqual({
      name: CATEGORY,
      topics: [{ name: `${CATEGORY}-first` }, { name: `${CATEGORY}-second` }],
    });
  });
});
