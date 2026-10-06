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
import { STORE_REVIEW_BASELINE_FRESH_MS } from './voc.constant';
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
  /** Slack에 알린 수 */
  notifiedCount: number;
  /** 이번 주기에 처음 기록한 스토어 — 쌓여 있던 리뷰는 알리지 않고 기준선으로 적었다 */
  baselineStores: ReviewStore[];
}

/**
 * 스토어 리뷰 → Slack(KAN-133 VoC). 15분마다 두 스토어를 조회해 **새 리뷰와 수정된 리뷰만** 채널에 올린다.
 *
 * 켜짐 판정은 스토어별이다 — 자격증명이 전부 있는 스토어만 조회하고, Slack 웹훅이 없으면 아무것도 하지 않는다
 * (조회해도 보낼 곳이 없다). 한 스토어의 실패가 다른 스토어를 막지 않는다.
 *
 * **스토어를 처음 기록할 때는 쌓여 있던 리뷰를 알리지 않고 기록만 한다**(domain.md 10.4). 스토어에는 이미 수십
 * 건이 쌓여 있는데 그걸 한꺼번에 채널에 쏟으면 첫날 알림이 소음이 되고, 그 뒤로 채널을 안 보게 된다. 판정은
 * **스토어별**이고(그 스토어의 행이 하나도 없을 때), **리뷰의 시각**으로 가른다 — 최근 24시간 안의 것은 새 리뷰로
 * 알리고 더 오래된 것만 기준선(`notified_at` NULL)이다. 표 전체가 비었는지로 가르던 때는 리뷰가 0건이던
 * 스토어의 첫 리뷰가 기준선으로 삼켜졌고, 나중에 켠 스토어의 옛 리뷰가 전부 새 리뷰로 나갔다(2026-10-06).
 *
 * **보냈을 때만 기록한다.** 전송은 결과를 기다리는 `SlackAlertService.post`다 — 웹훅이 죽은 주기의 리뷰는
 * 기록하지 않아 다음 주기에 다시 고른다. 기준선 행은 알릴 것이 아니므로 전송과 무관하게 바로 적는다.
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
      baselineStores: [],
    };

    if (!this.configured) {
      return result;
    }

    const notices: ReviewNotice[] = [];
    const baseline: StoreReviewItem[] = [];
    const freshSince = now.getTime() - STORE_REVIEW_BASELINE_FRESH_MS;

    for (const store of polledStores) {
      let reviews: StoreReviewItem[];

      try {
        reviews = await this.fetchStore(store, now);
      } catch (error) {
        result.failedStores.push(store);
        this.logFetchFailure(store, error);
        continue;
      }

      result.fetchedCount += reviews.length;

      if (reviews.length === 0) {
        continue;
      }

      if (await this.storeReviewRepository.hasAnyByStore(store)) {
        notices.push(...(await this.selectNotices(store, reviews)));
        continue;
      }

      // 이 스토어의 첫 기록(클래스 주석) — 최근 것은 새 리뷰로 알리고, 쌓여 있던 것은 기준선으로 적기만 한다
      result.baselineStores.push(store);
      for (const review of reviews) {
        if (review.lastModifiedAt.getTime() >= freshSince) {
          notices.push({ review, previousRating: null });
        } else {
          baseline.push(review);
        }
      }
    }

    if (baseline.length > 0) {
      await this.storeReviewRepository.upsert(
        baseline.map((review) => toRow(review, null)),
      );
      this.logger.log('store reviews baseline recorded without notifying', {
        stores: result.baselineStores,
        recorded_count: baseline.length,
      });
    }

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
   * 기록이 있는 스토어에서 알릴 것 — 표에 없는 리뷰(새 것)와, 있지만 `last_modified_at`이 커진 리뷰(수정됨).
   * 같은 시각이거나 더 오래된 값은 이미 알린 것이다(기준선 포함).
   */
  private async selectNotices(
    store: ReviewStore,
    reviews: StoreReviewItem[],
  ): Promise<ReviewNotice[]> {
    const notices: ReviewNotice[] = [];
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
