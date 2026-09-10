import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import {
  RATE_LIMIT_DEFAULT_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '@/common/rate-limit.constant';
import { EnvironmentVariables, validateEnv } from '@/config/env.validation';
import { DatabaseModule } from '@/database/database.module';
import { AdminModule } from '@/modules/admin/admin.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { ContentDetailModule } from '@/modules/content-detail/content-detail.module';
import { DripBatchModule } from '@/modules/drip-batch/drip-batch.module';
import { ExploreModule } from '@/modules/explore/explore.module';
import { HealthModule } from '@/modules/health/health.module';
import { LibraryScreenModule } from '@/modules/library-screen/library-screen.module';
import { OnboardingModule } from '@/modules/onboarding/onboarding.module';
import { PartnerModule } from '@/modules/partner/partner.module';
import { PlaybackModule } from '@/modules/playback/playback.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { RetentionModule } from '@/modules/retention/retention.module';
import { SettingsModule } from '@/modules/settings/settings.module';
import { UserModule } from '@/modules/user/user.module';

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
    // 전역 설정 모듈 — 서명 키는 환경 변수로만 주입한다 (architecture.md 9.5)
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
      }),
    }),
    // 첫 드립 재시도(`FirstDripRetryScheduler`)가 도는 근거.
    // 별도 큐 인프라 대신 DB 작업 테이블 + 스케줄러를 쓴다 (architecture.md 미결 사항)
    ScheduleModule.forRoot(),
    // architecture.md 9.6 — 전역 기본 한도. 라우트별 한도는 `@Throttle`, 제외는 `@SkipThrottle`
    ThrottlerModule.forRoot({
      throttlers: [
        { ttl: RATE_LIMIT_WINDOW_MS, limit: RATE_LIMIT_DEFAULT_PER_MINUTE },
      ],
    }),
    DatabaseModule,
    HealthModule,
    UserModule,
    AuthModule,
    OnboardingModule,
    PlaybackModule,
    LibraryScreenModule,
    ExploreModule,
    DripBatchModule,
    ContentDetailModule,
    ProfileModule,
    SettingsModule,
    PartnerModule,
    AdminModule,
    // domain.md 12.1의 보존 기간 배치. 어떤 모듈도 이 모듈을 의존하지 않는다
    RetentionModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
