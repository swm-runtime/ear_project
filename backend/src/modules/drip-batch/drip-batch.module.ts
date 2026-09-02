import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { DripModule } from '@/modules/drip/drip.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryModule } from '@/modules/library/library.module';
import { PlaybackModule } from '@/modules/playback/playback.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';
import { UserModule } from '@/modules/user/user.module';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';
import { DripBatchScheduler } from './drip-batch.scheduler';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다**(architecture.md 3.3 — "드립 편성 배치"가
 * 명시된 Orchestrator 대상). 스코어링 입력인 소비 신호(`user_signals`)의 소유자가
 * `playback`인데 `playback → drip` 의존이 이미 있어(재생 시 영구 제외 적재) `drip`이
 * 신호를 직접 읽으면 순환이 된다 — 그래서 두 모듈 **위에서** 조합한다.
 * 어떤 모듈도 이 모듈을 의존하지 않는다.
 */
@Module({
  imports: [
    UserModule,
    InterestModule,
    SubscriptionModule,
    ContentModule,
    LibraryModule,
    PlaybackModule,
    DripModule,
  ],
  providers: [DripBatchOrchestrator, DripBatchScheduler],
})
export class DripBatchModule {}
