import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AlertModule } from '@/modules/alert/alert.module';

import { AppRemoveAlertScheduler } from './app-remove-alert.scheduler';
import { AppRemoveAlertService } from './app-remove-alert.service';
import { AppStoreReviewClient } from './app-store-review.client';
import { Ga4RealtimeClient } from './ga4-realtime.client';
import { PlayReviewClient } from './play-review.client';
import { StoreReviewPollScheduler } from './store-review-poll.scheduler';
import { StoreReviewPollService } from './store-review-poll.service';
import { StoreReview } from './store-review.entity';
import { StoreReviewRepository } from './store-review.repository';

/**
 * VoC(KAN-133) — App Store·Google Play 리뷰를 주기적으로 읽어 Slack에 올린다. `store_reviews`를 소유한다.
 *
 * 결제 모듈과 같은 스토어 자격증명(`APP_STORE_APP_APPLE_ID` · `GOOGLE_PLAY_*`)을 읽지만 **`BillingModule`을
 * 의존하지 않는다** — 리뷰 조회는 결제와 무관하고, 클라이언트는 여기 작게 따로 있다. App Store는 결제 키가 아니라
 * App Store Connect **팀 키**(`APP_STORE_CONNECT_*`)가 따로 필요하다. 어떤 모듈도 이 모듈을 의존하지 않는다.
 *
 * **앱 삭제 알림**(2026-10-06)도 여기다 — GA4 실시간 `app_remove`를 15분마다 읽어 Slack 에 올린다. 일일 보고의 GA4
 * 자격(`GA4_*`)을 재사용하되 `AdminModule`을 의존하지 않는다(REST 클라이언트가 여기 작게 따로 있다).
 */
@Module({
  imports: [TypeOrmModule.forFeature([StoreReview]), AlertModule],
  providers: [
    StoreReviewRepository,
    AppStoreReviewClient,
    PlayReviewClient,
    StoreReviewPollService,
    StoreReviewPollScheduler,
    Ga4RealtimeClient,
    AppRemoveAlertService,
    AppRemoveAlertScheduler,
  ],
})
export class VocModule {}
