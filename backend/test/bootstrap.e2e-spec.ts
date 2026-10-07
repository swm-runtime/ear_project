import { Body, Controller, HttpStatus, Post, Req } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';

import { NEST_APP_OPTIONS, configureApp } from '@/main';

/**
 * **부팅 스모크** — `main.ts` 의 앱 조립(`configureApp`)을 **그대로** 거쳐 본문이 파싱되는지 본다(2026-10-07 운영 장애).
 *
 * 다른 e2e 는 각자 앱을 조립해서 `main.ts` 의 실수를 잡지 못했다 — Sentry 웹훅 경로에만 `express.json()` 을 걸자
 * Nest 가 전역 파서 등록을 건너뛰어 모든 JSON 요청이 400 이 됐고, 운영에 나가서야 드러났다. 이 테스트는 DB 없이
 * 작은 컨트롤러 둘만 올리고 **진짜 조립 함수**를 부른다 — 파서·프리픽스·검증 파이프가 운영과 같은 순서로 붙는다.
 */

@Controller('t')
class EchoController {
  @Post('echo')
  echo(@Body() body: unknown) {
    return { got: body ?? null };
  }
}

/** Sentry 웹훅 경로 밑 — 경로별 파서(2mb · rawBody)가 붙는지 본다. 프리픽스 `api/v1` 뒤에 `webhooks/sentry` 로 시작해야 한다 */
@Controller('webhooks/sentry/t')
class SentryPathController {
  @Post()
  take(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown) {
    return {
      rawBodyBytes: req.rawBody?.length ?? null,
      keys: body && typeof body === 'object' ? Object.keys(body).length : null,
    };
  }
}

describe('부팅 스모크 — main.ts 의 configureApp 으로 조립한 앱', () => {
  let app: NestExpressApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [EchoController, SentryPathController],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication<App>>(
      undefined,
      NEST_APP_OPTIONS,
    );
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('일반 경로의 JSON 본문이 파싱된다 — 비어 들어오면 로그인·토큰 갱신이 전부 400 이 된다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/t/echo')
      .send({ provider: 'kakao', device_id: 'd1' })
      .expect(HttpStatus.CREATED);

    expect(response.body).toEqual({
      got: { provider: 'kakao', device_id: 'd1' },
    });
  });

  it('urlencoded 본문도 파싱된다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/t/echo')
      .type('form')
      .send('a=1&b=2')
      .expect(HttpStatus.CREATED);

    expect(response.body).toEqual({ got: { a: '1', b: '2' } });
  });

  it('Sentry 웹훅 경로는 2mb 까지 받고 rawBody 를 남긴다 — 그 밖의 경로는 100kb 를 넘기면 413', async () => {
    const big = { pad: 'x'.repeat(1_500_000) };

    const sentry = await request(app.getHttpServer())
      .post('/api/v1/webhooks/sentry/t')
      .send(big)
      .expect(HttpStatus.CREATED);
    expect(sentry.body.keys).toBe(1);
    expect(sentry.body.rawBodyBytes).toBeGreaterThan(1_500_000);

    const other = await request(app.getHttpServer())
      .post('/api/v1/t/echo')
      .send(big);
    expect(other.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
  });

  it('전역 프리픽스·보안 헤더가 붙는다', async () => {
    const response = await request(app.getHttpServer())
      .post('/t/echo')
      .send({});
    expect(response.status).toBe(HttpStatus.NOT_FOUND);

    const prefixed = await request(app.getHttpServer())
      .post('/api/v1/t/echo')
      .send({});
    expect(prefixed.headers['x-content-type-options']).toBe('nosniff');
  });
});
