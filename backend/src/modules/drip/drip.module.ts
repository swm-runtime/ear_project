import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContentModule } from '@/modules/content/content.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryModule } from '@/modules/library/library.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';
import { UserModule } from '@/modules/user/user.module';

import { DripExcludedContent } from './entities/drip-excluded-content.entity';
import { FirstDripJob } from './entities/first-drip-job.entity';
import { FirstDripRetryScheduler } from './first-drip-retry.scheduler';
import { DripExcludedContentRepository } from './repositories/drip-excluded-content.repository';
import { FirstDripJobRepository } from './repositories/first-drip-job.repository';
import { FirstDripService } from './services/first-drip.service';

/**
 * domain.md 2장 — `drip`은 `content` · `library` · `interest` · `subscription`에 의존한다.
 * 여기에 더해 **편성 편수 판정에 사용자 티어가 필요해 `user`에도 의존한다.**
 * 순환은 생기지 않는다(`user`는 `drip`을 모른다).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DripExcludedContent, FirstDripJob]),
    ContentModule,
    LibraryModule,
    InterestModule,
    SubscriptionModule,
    UserModule,
  ],
  providers: [
    DripExcludedContentRepository,
    FirstDripJobRepository,
    FirstDripService,
    FirstDripRetryScheduler,
  ],
  exports: [FirstDripService],
})
export class DripModule {}
