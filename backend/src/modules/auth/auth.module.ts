import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdempotencyModule } from '@/modules/idempotency/idempotency.module';
import { UserModule } from '@/modules/user/user.module';

import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { DailyActiveUser } from './daily-active-user.entity';
import { DailyActiveUserRepository } from './daily-active-user.repository';
import { DailyActiveUserScheduler } from './daily-active-user.scheduler';
import { UserActiveDate } from './user-active-date.entity';
import { AppleClient } from './providers/apple.client';
import { DevClient } from './providers/dev.client';
import { GoogleClient } from './providers/google.client';
import { KakaoClient } from './providers/kakao.client';
import { NaverClient } from './providers/naver.client';
import { SocialProviderRegistry } from './providers/social-provider.registry';
import { SessionPurgeScheduler } from './session-purge.scheduler';
import { Session } from './session.entity';
import { SessionRepository } from './session.repository';
import { TokenService } from './services/token.service';

/**
 * architecture.md 4.3 — Auth → User 단방향.
 *
 * 일별 접속자(`daily_active_users`)·사람별 접속일(`user_active_dates`)도 여기서 소유한다 — 원천이 이 모듈의 `sessions`이고, 표가 필요한 이유가 이 모듈의 세션 파기
 * (`SessionPurgeScheduler`)다. 서비스 지표(admin)는 다른 집계 표(`play_daily_totals`)처럼 읽기만 한다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Session, DailyActiveUser, UserActiveDate]),
    UserModule,
    IdempotencyModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionRepository,
    SessionPurgeScheduler,
    DailyActiveUserRepository,
    DailyActiveUserScheduler,
    SocialProviderRegistry,
    KakaoClient,
    GoogleClient,
    NaverClient,
    AppleClient,
    // 개발 환경에서만 레지스트리가 꺼내 쓴다 (dev.client.ts)
    DevClient,
  ],
  // 시장 전환(`market-change` — global-api.md 4.11)이 바뀐 시장을 담은 access token을 다시 발급한다
  exports: [TokenService],
})
export class AuthModule {}
