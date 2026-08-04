import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { parseCsvList } from '@/common/utils/parse-csv-list.util';
import { EnvironmentVariables } from '@/config/env.validation';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

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
