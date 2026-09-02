import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { parseCsvList } from '@/common/utils/parse-csv-list.util';
import { EnvironmentVariables } from '@/config/env.validation';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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

  await app.listen(configService.get('PORT', { infer: true }));
}

void bootstrap();
