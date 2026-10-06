import { Injectable, Logger } from '@nestjs/common';

import { SlackAlertService } from '@/modules/alert/slack-alert.service';

import { AppStoreReviewClient } from './app-store-review.client';
import { PlayReviewClient } from './play-review.client';
import {
  formatReviewDigest,
  ReviewNotice,
} from './store-review-message.format';
import {
  StoreReviewRepository,
  StoreReviewUpsertRow,
} from './store-review.repository';
import { ReviewStore } from './voc.enum';
import { StoreReviewFetchError, StoreReviewItem } from './voc.types';

/** 한 주기의 결과 — 스케줄러 로그와 테스트가 본다 */
export interface StoreReviewPollResult {
  /** 조회한 스토어 */
  polledStores: ReviewStore[];
  /** 조회에 실패한 스토어 — 다른 스토어는 그대로 진행한다 */
  failedStores: ReviewStore[];
  /** 가져온 리뷰 수 */
  fetchedCount: number;
  /** Slack에 알린 수(첫 실행이면 0) */
  notifiedCount: number;
  /** 첫 실행이라 기록만 했는가 */
  isFirstRun: boolean;
}

/**
 * 스토어 리뷰 → Slack(KAN-133 VoC). 15분마다 두 스토어를 조회해 **새 리뷰와 수정된 리뷰만** 채널에 올린다.
 *
 * 켜짐 판정은 스토어별이다 — 자격증명이 전부 있는 스토어만 조회하고, Slack 웹훅이 없으면 아무것도 하지 않는다
 * (조회해도 보낼 곳이 없다). 한 스토어의 실패가 다른 스토어를 막지 않는다.
 *
 * **첫 실행(표가 비어 있을 때)은 알리지 않고 기록만 한다.** 스토어에는 이미 수십 건이 쌓여 있는데 그걸 한꺼번에
 * 채널에 쏟으면 첫날 알림이 소음이 되고, 그 뒤로 채널을 안 보게 된다. 첫 실행이 "지금까지의 리뷰"를 기준선으로
 * 적어 두면 다음 주기부터는 그 뒤에 생기거나 바뀐 것만 보인다. 기준선 행은 `notified_at`이 NULL이다.
 *
 * **Slack 전송은 `SlackAlertService.notify`라 기다리지 않는다**(던지지 않고 실패는 경고 로그). 그래서 전송을
 * 띄운 직후 기록한다 — 웹훅이 죽어 있던 15분의 리뷰는 다시 알리지 않는다(실패 로그로 남는다). 이것을 바꾸려면
 * 알림 통로가 결과를 돌려줘야 한다(보고서 참고).
 *
 * 로그에는 리뷰 id·건수만 남긴다 — 본문·닉네임은 어떤 레벨에서도 적지 않는다(convention.md 8.4).
 */
@Injectable()
export class StoreReviewPollService {
  private readonly logger = new Logger(StoreReviewPollService.name);

  constructor(
    private readonly appStoreReviewClient: AppStoreReviewClient,
    private readonly playReviewClient: PlayReviewClient,
    private readonly storeReviewRepository: StoreReviewRepository,
    private readonly slackAlertService: SlackAlertService,
  ) {}

  /** 켜진 스토어 — 자격증명이 전부 있는 것만 */
  enabledStores(): ReviewStore[] {
    const stores: ReviewStore[] = [];

    if (this.appStoreReviewClient.isEnabled()) {
      stores.push(ReviewStore.APP_STORE);
    }

    if (this.playReviewClient.isEnabled()) {
      stores.push(ReviewStore.PLAY_STORE);
    }

    return stores;
  }

  /** 돌 조건 — 켜진 스토어가 하나라도 있고, 보낼 Slack 웹훅이 있다 */
  get configured(): boolean {
    return this.enabledStores().length > 0 && this.slackAlertService.enabled;
  }

  async poll(now: Date): Promise<StoreReviewPollResult> {
    const polledStores = this.enabledStores();
    const result: StoreReviewPollResult = {
      polledStores,
      failedStores: [],
      fetchedCount: 0,
      notifiedCount: 0,
      isFirstRun: false,
    };

    if (!this.configured) {
      return result;
    }

    const fetched: StoreReviewItem[] = [];

    for (const store of polledStores) {
      try {
        fetched.push(...(await this.fetchStore(store, now)));
      } catch (error) {
        result.failedStores.push(store);
        this.logFetchFailure(store, error);
      }
    }

    result.fetchedCount = fetched.length;

    if (fetched.length === 0) {
      return result;
    }

    // 첫 실행: 지금 보이는 리뷰를 기준선으로 적기만 한다(클래스 주석) — 알리지 않는다
    if ((await this.storeReviewRepository.countAll()) === 0) {
      result.isFirstRun = true;
      await this.storeReviewRepository.upsert(
        fetched.map((review) => toRow(review, null)),
      );
      this.logger.log('store reviews baseline recorded without notifying', {
        recorded_count: fetched.length,
      });

      return result;
    }

    const notices = await this.selectNotices(fetched);

    if (notices.length === 0) {
      return result;
    }

    // 보냈을 때만 기록한다 — 웹훅이 죽은 주기의 리뷰는 다음 주기에 다시 고른다
    const sent = await this.slackAlertService.post(
      'store-review',
      formatReviewDigest(notices),
    );
    if (!sent) {
      return result;
    }
    await this.storeReviewRepository.upsert(
      notices.map((notice) => toRow(notice.review, now)),
    );

    result.notifiedCount = notices.length;
    this.logger.log('store reviews notified', {
      notified_count: notices.length,
      new_count: notices.filter((notice) => notice.previousRating === null)
        .length,
      review_ids: notices.map(
        (notice) => `${notice.review.store}:${notice.review.reviewId}`,
      ),
    });

    return result;
  }

  private fetchStore(
    store: ReviewStore,
    now: Date,
  ): Promise<StoreReviewItem[]> {
    return store === ReviewStore.APP_STORE
      ? this.appStoreReviewClient.fetchRecentReviews(now)
      : this.playReviewClient.fetchRecentReviews();
  }

  /**
   * 가져온 리뷰 중 알릴 것 — 표에 없는 리뷰(새 것)와, 있지만 `last_modified_at`이 커진 리뷰(수정됨).
   * 같은 시각이거나 더 오래된 값은 이미 알린 것이다(첫 실행 기준선 포함).
   */
  private async selectNotices(
    fetched: StoreReviewItem[],
  ): Promise<ReviewNotice[]> {
    const notices: ReviewNotice[] = [];

    for (const store of [ReviewStore.APP_STORE, ReviewStore.PLAY_STORE]) {
      const reviews = fetched.filter((review) => review.store === store);

      if (reviews.length === 0) {
        continue;
      }

      const known = new Map(
        (
          await this.storeReviewRepository.findAllByStoreAndReviewIds(
            store,
            reviews.map((review) => review.reviewId),
          )
        ).map((row) => [row.reviewId, row]),
      );

      for (const review of reviews) {
        const row = known.get(review.reviewId);

        if (!row) {
          notices.push({ review, previousRating: null });
        } else if (
          review.lastModifiedAt.getTime() > row.lastModifiedAt.getTime()
        ) {
          notices.push({ review, previousRating: row.rating });
        }
      }
    }

    return notices;
  }

  /** 자격증명 문제는 사람이 봐야 해서 error, 일시 실패는 다음 주기가 다시 하므로 warn */
  private logFetchFailure(store: ReviewStore, error: unknown): void {
    if (error instanceof StoreReviewFetchError) {
      const level = error.kind === 'transient' ? 'warn' : 'error';
      this.logger[level]('store review fetch failed', {
        store,
        http_status: error.status,
        failure_kind: error.kind,
      });

      return;
    }

    this.logger.error('store review fetch failed', {
      store,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}

function toRow(
  review: StoreReviewItem,
  notifiedAt: Date | null,
): StoreReviewUpsertRow {
  return {
    store: review.store,
    reviewId: review.reviewId,
    rating: review.rating,
    lastModifiedAt: review.lastModifiedAt,
    notifiedAt,
  };
}
