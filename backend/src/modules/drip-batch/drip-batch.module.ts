import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { DripModule } from '@/modules/drip/drip.module';
import { InterestModule } from '@/modules/interest/interest.module';
import { LibraryModule } from '@/modules/library/library.module';
import { NotificationModule } from '@/modules/notification/notification.module';
import { PlaybackModule } from '@/modules/playback/playback.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';
import { UserModule } from '@/modules/user/user.module';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';
import { DripBatchScheduler } from './drip-batch.scheduler';
import { DripPreviewController } from './drip-preview.controller';
import { DripPreviewService } from './drip-preview.service';

/**
 * **Entity를 소유하지 않는 유스케이스 모듈이다**(architecture.md 3.3 — "드립 편성 배치"가
 * 명시된 Orchestrator 대상). 스코어링 입력인 소비 신호(`user_signals`)의 소유자가
 * `playback`인데 `playback → drip` 의존이 이미 있어(재생 시 영구 제외 적재) `drip`이
 * 신호를 직접 읽으면 순환이 된다 — 그래서 두 모듈 **위에서** 조합한다.
 * 제품 경로의 어떤 모듈도 이 모듈을 의존하지 않는다(예외는 아래 `exports` 주석).
 *
 * 편성 미리보기(`GET /admin/drip/preview`, 읽기 전용)도 여기 둔다 — 배치와 **같은 계산기**
 * (`DripBatchOrchestrator.planForUser`)를 저장 없이 부르는 관리자 조회라 이 모듈 밖에 둘 이유가 없다.
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
    // 편성 직후 드립 도착 알림(notification.md 4.3) — notification 은 user 만 알아 순환이 없다
    NotificationModule,
  ],
  controllers: [DripPreviewController],
  providers: [DripBatchOrchestrator, DripBatchScheduler, DripPreviewService],
  /**
   * 추천 테스트 콘솔(`recommend-test`)만 이 모듈을 의존한다(2026-09-29) — 행동 직후 배치가 하는 취향
   * 캐시 재계산을 같은 함수로 수행해 탐색 피드가 바로 바뀌게 하기 위해서다. 제품 경로에서는 여전히
   * 어떤 모듈도 이 모듈을 의존하지 않는다.
   */
  exports: [DripBatchOrchestrator],
})
export class DripBatchModule {}
