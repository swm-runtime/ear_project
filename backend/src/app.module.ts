import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { validateEnv } from '@/config/env.validation';
import { DatabaseModule } from '@/database/database.module';
import { HealthModule } from '@/modules/health/health.module';

/**
 * architecture.md 4.4 — AppModule은 최상위 조립만 한다.
 * Controller·Service를 갖지 않고, 비즈니스 Provider를 선언하지 않는다.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 검증에 실패하면 기동을 중단한다 (architecture.md 9.5)
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
