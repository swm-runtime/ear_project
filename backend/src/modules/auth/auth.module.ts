import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdempotencyModule } from '@/modules/idempotency/idempotency.module';
import { UserModule } from '@/modules/user/user.module';

import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { AppleClient } from './providers/apple.client';
import { DevClient } from './providers/dev.client';
import { GoogleClient } from './providers/google.client';
import { KakaoClient } from './providers/kakao.client';
import { NaverClient } from './providers/naver.client';
import { SocialProviderRegistry } from './providers/social-provider.registry';
import { Session } from './session.entity';
import { SessionRepository } from './session.repository';
import { TokenService } from './services/token.service';

/** architecture.md 4.3 — Auth → User 단방향 */
@Module({
  imports: [TypeOrmModule.forFeature([Session]), UserModule, IdempotencyModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionRepository,
    SocialProviderRegistry,
    KakaoClient,
    GoogleClient,
    NaverClient,
    AppleClient,
    // 개발 환경에서만 레지스트리가 꺼내 쓴다 (dev.client.ts)
    DevClient,
  ],
})
export class AuthModule {}
