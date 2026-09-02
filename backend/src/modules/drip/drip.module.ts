import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContentModule } from '@/modules/content/content.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryModule } from '@/modules/library/library.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';
import { UserModule } from '@/modules/user/user.module';

import { DripBatchRun } from './entities/drip-batch-run.entity';
import { DripExcludedContent } from './entities/drip-excluded-content.entity';
import { FirstDripJob } from './entities/first-drip-job.entity';
import { UserPreferenceVector } from './entities/user-preference-vector.entity';
import { FirstDripRetryScheduler } from './first-drip-retry.scheduler';
import { DripBatchRunRepository } from './repositories/drip-batch-run.repository';
import { DripExcludedContentRepository } from './repositories/drip-excluded-content.repository';
import { FirstDripJobRepository } from './repositories/first-drip-job.repository';
import { UserPreferenceVectorRepository } from './repositories/user-preference-vector.repository';
import { DripBatchRunService } from './services/drip-batch-run.service';
import { DripExclusionService } from './services/drip-exclusion.service';
import { DripPlacementService } from './services/drip-placement.service';
import { DripScoringService } from './services/drip-scoring.service';
import { FirstDripService } from './services/first-drip.service';
import { PreferenceVectorService } from './services/preference-vector.service';

/**
 * domain.md 2장 — `drip`은 `content` · `library` · `interest` · `subscription`에 의존한다.
 * 여기에 더해 **편성 편수 판정에 사용자 티어가 필요해 `user`에도 의존한다.**
 * 순환은 생기지 않는다(`user`는 `drip`을 모른다).
 *
 * **일일 편성 배치는 이 모듈에 없다** — 배치가 읽는 소비 신호(`user_signals`)의 소유자가
 * `playback`인데 `playback → drip` 의존이 이미 있어(재생 시 영구 제외 적재) 반대 방향은
 * 순환이 된다. 배치는 두 모듈 위의 유스케이스 모듈 `drip-batch`(Orchestrator)가 조합한다
 * (architecture.md 3.3 — "드립 편성 배치"가 명시된 Orchestrator 대상이다).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DripExcludedContent,
      FirstDripJob,
      UserPreferenceVector,
      DripBatchRun,
    ]),
    ContentModule,
    LibraryModule,
    InterestModule,
    SubscriptionModule,
    UserModule,
  ],
  providers: [
    DripExcludedContentRepository,
    FirstDripJobRepository,
    UserPreferenceVectorRepository,
    DripBatchRunRepository,
    DripExclusionService,
    FirstDripService,
    PreferenceVectorService,
    DripScoringService,
    DripPlacementService,
    DripBatchRunService,
    FirstDripRetryScheduler,
  ],
  exports: [
    DripExclusionService,
    FirstDripService,
    PreferenceVectorService,
    DripScoringService,
    DripPlacementService,
    DripBatchRunService,
  ],
})
export class DripModule {}
