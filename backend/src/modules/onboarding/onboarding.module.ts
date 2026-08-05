import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { DripModule } from '@/modules/drip/drip.module';
import { IdempotencyModule } from '@/modules/idempotency/idempotency.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryModule } from '@/modules/library/library.module';
import { UserModule } from '@/modules/user/user.module';

import { OnboardingController } from './onboarding.controller';
import { OnboardingOrchestrator } from './onboarding.orchestrator';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다.**
 *
 * 온보딩은 화면 흐름이라 자기 데이터가 없고, `users` · `user_interests` · `contents` ·
 * `library_items` · `first_drip_jobs`를 횡단한다. 그래서 Repository 없이 Orchestrator가
 * 각 소유 모듈의 Service를 조합한다(architecture.md 3.3).
 */
@Module({
  imports: [
    UserModule,
    InterestModule,
    ContentModule,
    LibraryModule,
    DripModule,
    IdempotencyModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingOrchestrator],
})
export class OnboardingModule {}
