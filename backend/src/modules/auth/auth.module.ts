import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdempotencyModule } from '@/modules/idempotency/idempotency.module';
import { UserModule } from '@/modules/user/user.module';

import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
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
  ],
})
export class AuthModule {}
