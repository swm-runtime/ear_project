// Sentry 는 다른 무엇보다 먼저 로드되어야 한다 — 이 줄의 위치를 바꾸지 않는다 (instrument.ts 주석)
import { sentryEnabled } from './instrument';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { parseCsvList } from '@/common/utils/parse-csv-list.util';
import { EnvironmentVariables } from '@/config/env.validation';

import { AppModule } from './app.module';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 본문 파서는 아래에서 직접 등록한다(주석 참고)
    bodyParser: false,
  });
  const configService =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  /**
   * LB 뒤에 배포할 때만 env로 켠다(`TRUST_PROXY_HOPS` — 기본 0).
   *
   * 켜야 `X-Forwarded-For`에서 진짜 클라이언트 IP를 읽어 `audio_access_logs.ip_hash`
   * 이상 탐지(FR-33)가 동작한다. **프록시가 없는데 켜면 반대로 IP 위조 구멍이 된다** —
   * 그래서 값은 코드가 아니라 배포 설정이 정한다(env.validation.ts 참조).
   */
  const trustProxyHops = configService.get('TRUST_PROXY_HOPS', {
    infer: true,
  });
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  /**
   * 본문 파서는 **직접 등록한다**(`bodyParser: false`, 2026-10-07 운영 장애 — `v1.2.0+3`).
   *
   * Sentry 웹훅 경로에만 `express.json()`을 따로 걸었더니, Nest 가 앱 어딘가에 `jsonParser` 라는 이름의 미들웨어가
   * 있으면 **자기 전역 파서 등록을 건너뛰는** 바람에(`ExpressAdapter.isMiddlewareApplied` — 경로 한정이어도 이름만
   * 본다) 다른 모든 경로의 본문이 비어 들어와 로그인·토큰 갱신이 전부 400 이었다(18:30~19:00 KST). e2e 는 `main.ts`
   * 를 거치지 않아 잡지 못했다.
   *
   * 그래서 Nest 의 자동 등록에 기대지 않고 둘을 **이 순서로** 명시한다:
   * 1. Sentry 웹훅 경로 — 본문이 이벤트(스택·컨텍스트)째 와서 기본 한도(100kb)를 넘긴다 → **2mb**. 서명 검증은 받은
   *    그대로의 본문으로 해야 하므로 `rawBody` 를 보관한다(`modules/alert/sentry-webhook.controller.ts`). 여기서
   *    파싱되면 아래 전역 파서는 `req.body` 가 이미 있어 건너뛴다.
   * 2. 그 밖의 모든 경로 — Nest 기본과 같은 json(100kb)·urlencoded.
   */
  app.use(
    '/api/v1/webhooks/sentry',
    json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // architecture.md 9.5 — 보안 헤더 전역 적용, CORS 허용 오리진 명시(`*` 금지)
  app.use(helmet());
  app.use(traceIdMiddleware);
  app.enableCors({
    origin: parseCsvList(configService.get('CORS_ORIGINS', { infer: true })),
    credentials: true,
  });

  // convention.md 5.1 — 모든 API는 /api/v1 하위에 둔다
  app.setGlobalPrefix('api/v1');

  // architecture.md 9.3 — DTO에 선언되지 않은 필드는 잘라낸다
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /**
   * SIGTERM에 `onModuleDestroy`·`beforeApplicationShutdown` 훅이 돌게 한다. 없으면 배포의
   * `docker compose up -d`가 컨테이너를 끊을 때 TypeORM 풀이 정리되지 않고 진행 중인
   * 스케줄러 작업이 중간에 잘린다(2026-09-09 감사 — 하등급).
   */
  app.enableShutdownHooks();

  if (sentryEnabled) {
    new Logger('Bootstrap').log('sentry enabled');
  }

  await app.listen(configService.get('PORT', { infer: true }));
}

/**
 * 기본 진입점은 `dist/cluster` 다(`Dockerfile` 의 `CMD`). 그쪽이 워커 수를 보고 이 함수를 부른다.
 * 직접 실행(`node dist/main`)도 종전처럼 앱 하나를 띄운다 — 로컬 실측에서 쓰는 경로다.
 */
if (require.main === module) {
  void bootstrap();
}
