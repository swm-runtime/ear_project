import { Logger } from '@nestjs/common';

import { SlackAlertService } from '@/modules/alert/slack-alert.service';

import { AppStoreReviewClient } from './app-store-review.client';
import { PlayReviewClient } from './play-review.client';
import { StoreReviewPollService } from './store-review-poll.service';
import { StoreReview } from './store-review.entity';
import {
  StoreReviewRepository,
  StoreReviewUpsertRow,
} from './store-review.repository';
import { ReviewStore } from './voc.enum';
import { StoreReviewFetchError, StoreReviewItem } from './voc.types';

const NOW = new Date('2026-10-06T03:00:00Z');

/** `(store, review_id)` 유니크를 흉내 내는 메모리 저장소 */
class FakeStoreReviewRepository {
  rows = new Map<string, StoreReviewUpsertRow>();

  seed(row: StoreReviewUpsertRow): void {
    this.rows.set(`${row.store}:${row.reviewId}`, row);
  }

  countAll(): Promise<number> {
    return Promise.resolve(this.rows.size);
  }

  findAllByStoreAndReviewIds(
    store: ReviewStore,
    reviewIds: string[],
  ): Promise<StoreReview[]> {
    return Promise.resolve(
      reviewIds
        .map((id) => this.rows.get(`${store}:${id}`))
        .filter((row): row is StoreReviewUpsertRow => row !== undefined)
        .map((row) => ({ ...row }) as StoreReview),
    );
  }

  upsert(rows: StoreReviewUpsertRow[]): Promise<void> {
    rows.forEach((row) => this.seed(row));

    return Promise.resolve();
  }
}

const review = (
  overrides: Partial<StoreReviewItem> & Pick<StoreReviewItem, 'reviewId'>,
): StoreReviewItem => ({
  store: ReviewStore.APP_STORE,
  rating: 4,
  title: null,
  body: '좋아요',
  lastModifiedAt: new Date('2026-10-05T00:00:00Z'),
  appVersion: null,
  territoryOrLanguage: null,
  ...overrides,
});

interface World {
  service: StoreReviewPollService;
  repository: FakeStoreReviewRepository;
  notify: jest.Mock;
  appStore: { isEnabled: jest.Mock; fetchRecentReviews: jest.Mock };
  play: { isEnabled: jest.Mock; fetchRecentReviews: jest.Mock };
}

function buildWorld(options: {
  appStore?: StoreReviewItem[] | Error;
  play?: StoreReviewItem[] | Error;
  slackEnabled?: boolean;
}): World {
  const answer = (value: StoreReviewItem[] | Error | undefined) =>
    value instanceof Error
      ? jest.fn().mockRejectedValue(value)
      : jest.fn().mockResolvedValue(value ?? []);
  const appStore = {
    isEnabled: jest.fn().mockReturnValue(options.appStore !== undefined),
    fetchRecentReviews: answer(options.appStore),
  };
  const play = {
    isEnabled: jest.fn().mockReturnValue(options.play !== undefined),
    fetchRecentReviews: answer(options.play),
  };
  const repository = new FakeStoreReviewRepository();
  const notify = jest.fn().mockResolvedValue(true);
  const slack = { enabled: options.slackEnabled ?? true, post: notify };

  return {
    service: new StoreReviewPollService(
      appStore as unknown as AppStoreReviewClient,
      play as unknown as PlayReviewClient,
      repository as unknown as StoreReviewRepository,
      slack as unknown as SlackAlertService,
    ),
    repository,
    notify,
    appStore,
    play,
  };
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('StoreReviewPollService', () => {
  describe('configured', () => {
    it('켜진 스토어가 하나라도 있고 웹훅이 있으면 돈다', () => {
      expect(buildWorld({ appStore: [] }).service.configured).toBe(true);
      expect(buildWorld({ play: [] }).service.configured).toBe(true);
    });

    it('켜진 스토어가 없거나 웹훅이 없으면 돌지 않는다', () => {
      expect(buildWorld({}).service.configured).toBe(false);
      expect(
        buildWorld({ appStore: [], slackEnabled: false }).service.configured,
      ).toBe(false);
    });
  });

  describe('poll', () => {
    it('웹훅이 없으면 스토어를 조회하지도 않는다 — 보낼 곳이 없다', async () => {
      // given
      const world = buildWorld({
        appStore: [review({ reviewId: 'a' })],
        slackEnabled: false,
      });

      // when
      const result = await world.service.poll(NOW);

      // then
      expect(world.appStore.fetchRecentReviews).not.toHaveBeenCalled();
      expect(result.fetchedCount).toBe(0);
      expect(world.notify).not.toHaveBeenCalled();
    });

    it('첫 실행(표가 비어 있음)은 알리지 않고 기준선만 기록한다', async () => {
      // given
      const world = buildWorld({
        appStore: [review({ reviewId: 'a' }), review({ reviewId: 'b' })],
        play: [review({ reviewId: 'gp:1', store: ReviewStore.PLAY_STORE })],
      });

      // when
      const result = await world.service.poll(NOW);

      // then
      expect(result.isFirstRun).toBe(true);
      expect(result.notifiedCount).toBe(0);
      expect(world.notify).not.toHaveBeenCalled();
      expect(world.repository.rows.size).toBe(3);
      expect(
        [...world.repository.rows.values()].every(
          (row) => row.notifiedAt === null,
        ),
      ).toBe(true);
    });

    it('기준선 이후 새 리뷰만 한 메시지로 알리고 notified_at을 적는다', async () => {
      // given
      const world = buildWorld({
        appStore: [
          review({ reviewId: 'known' }),
          review({ reviewId: 'new-1', rating: 5, body: '새 리뷰 하나' }),
        ],
        play: [
          review({
            reviewId: 'gp:new',
            store: ReviewStore.PLAY_STORE,
            rating: 1,
            body: '새 리뷰 둘',
          }),
        ],
      });
      world.repository.seed({
        store: ReviewStore.APP_STORE,
        reviewId: 'known',
        rating: 4,
        lastModifiedAt: new Date('2026-10-05T00:00:00Z'),
        notifiedAt: null,
      });

      // when
      const result = await world.service.poll(NOW);

      // then
      expect(result.isFirstRun).toBe(false);
      expect(result.notifiedCount).toBe(2);
      expect(world.notify).toHaveBeenCalledTimes(1);
      const [kind, text] = world.notify.mock.calls[0] as [string, string];
      expect(kind).toBe('store-review');
      expect(text).toContain('스토어 리뷰 2건');
      expect(text).toContain('새 리뷰 하나');
      expect(text).toContain('새 리뷰 둘');
      expect(text).not.toContain('(수정됨');
      expect(world.repository.rows.get('app_store:new-1')?.notifiedAt).toEqual(
        NOW,
      );
      expect(
        world.repository.rows.get('play_store:gp:new')?.notifiedAt,
      ).toEqual(NOW);
      // 이미 알던 리뷰는 건드리지 않는다
      expect(
        world.repository.rows.get('app_store:known')?.notifiedAt,
      ).toBeNull();
    });

    it('수정 시각이 커진 리뷰는 (수정됨)으로 다시 알리고 별점·시각을 갱신한다', async () => {
      // given
      const world = buildWorld({
        appStore: [
          review({
            reviewId: 'edited',
            rating: 2,
            lastModifiedAt: new Date('2026-10-06T01:00:00Z'),
          }),
        ],
      });
      world.repository.seed({
        store: ReviewStore.APP_STORE,
        reviewId: 'edited',
        rating: 5,
        lastModifiedAt: new Date('2026-10-05T00:00:00Z'),
        notifiedAt: new Date('2026-10-05T00:15:00Z'),
      });

      // when
      const result = await world.service.poll(NOW);

      // then
      expect(result.notifiedCount).toBe(1);
      const [, text] = world.notify.mock.calls[0] as [string, string];
      expect(text).toContain('(수정됨 5→2)');
      const row = world.repository.rows.get('app_store:edited');
      expect(row?.rating).toBe(2);
      expect(row?.lastModifiedAt).toEqual(new Date('2026-10-06T01:00:00Z'));
      expect(row?.notifiedAt).toEqual(NOW);
    });

    it('이미 알린 리뷰가 그대로면(같은 수정 시각) 다시 알리지 않는다', async () => {
      // given
      const world = buildWorld({
        appStore: [review({ reviewId: 'same' })],
      });
      world.repository.seed({
        store: ReviewStore.APP_STORE,
        reviewId: 'same',
        rating: 4,
        lastModifiedAt: new Date('2026-10-05T00:00:00Z'),
        notifiedAt: new Date('2026-10-05T00:15:00Z'),
      });

      // when
      const result = await world.service.poll(NOW);

      // then
      expect(result.fetchedCount).toBe(1);
      expect(result.notifiedCount).toBe(0);
      expect(world.notify).not.toHaveBeenCalled();
    });

    it('같은 review_id가 다른 스토어에 있어도 섞이지 않는다', async () => {
      // given
      const world = buildWorld({
        appStore: [review({ reviewId: 'shared-id' })],
        play: [
          review({ reviewId: 'shared-id', store: ReviewStore.PLAY_STORE }),
        ],
      });
      world.repository.seed({
        store: ReviewStore.APP_STORE,
        reviewId: 'shared-id',
        rating: 4,
        lastModifiedAt: new Date('2026-10-05T00:00:00Z'),
        notifiedAt: NOW,
      });

      // when
      const result = await world.service.poll(NOW);

      // then — Play 쪽만 새 리뷰다
      expect(result.notifiedCount).toBe(1);
      const [, text] = world.notify.mock.calls[0] as [string, string];
      expect(text).toContain('Google Play');
      expect(text).not.toContain('App Store');
    });

    it('한 스토어가 실패해도 다른 스토어의 리뷰는 알린다', async () => {
      // given
      const world = buildWorld({
        appStore: new StoreReviewFetchError(ReviewStore.APP_STORE, 503),
        play: [review({ reviewId: 'gp:ok', store: ReviewStore.PLAY_STORE })],
      });
      world.repository.seed({
        store: ReviewStore.PLAY_STORE,
        reviewId: 'gp:baseline',
        rating: 3,
        lastModifiedAt: new Date('2026-10-01T00:00:00Z'),
        notifiedAt: null,
      });

      // when
      const result = await world.service.poll(NOW);

      // then
      expect(result.failedStores).toEqual([ReviewStore.APP_STORE]);
      expect(result.notifiedCount).toBe(1);
      expect(world.notify).toHaveBeenCalledTimes(1);
    });

    it('자격증명 실패(401)는 error, 일시 실패(429)는 warn으로 남기고 던지지 않는다', async () => {
      // given
      const errorSpy = jest.spyOn(Logger.prototype, 'error');
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      errorSpy.mockClear();
      warnSpy.mockClear();
      const world = buildWorld({
        appStore: new StoreReviewFetchError(ReviewStore.APP_STORE, 401),
        play: new StoreReviewFetchError(ReviewStore.PLAY_STORE, 429),
      });

      // when
      const result = await world.service.poll(NOW);

      // then
      expect(result.failedStores).toEqual([
        ReviewStore.APP_STORE,
        ReviewStore.PLAY_STORE,
      ]);
      expect(errorSpy).toHaveBeenCalledWith(
        'store review fetch failed',
        expect.objectContaining({
          store: ReviewStore.APP_STORE,
          http_status: 401,
        }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        'store review fetch failed',
        expect.objectContaining({
          store: ReviewStore.PLAY_STORE,
          http_status: 429,
        }),
      );
      expect(world.notify).not.toHaveBeenCalled();
    });

    it('Slack 메시지에는 리뷰어 닉네임이 들어갈 자리가 없다 — 입력 모양부터 닉네임이 없다', async () => {
      // given
      const world = buildWorld({
        appStore: [review({ reviewId: 'n1', title: '제목', body: '본문' })],
      });
      world.repository.seed({
        store: ReviewStore.APP_STORE,
        reviewId: 'baseline',
        rating: 3,
        lastModifiedAt: new Date('2026-10-01T00:00:00Z'),
        notifiedAt: null,
      });

      // when
      await world.service.poll(NOW);

      // then — 공통 모양의 키 목록을 고정한다. 여기에 닉네임 키가 생기면 이 테스트가 깨져야 한다
      const [, text] = world.notify.mock.calls[0] as [string, string];
      expect(text).toBe(
        ':speech_balloon: 스토어 리뷰 1건\n\n:star: 4/5 · App Store · 10/05\n> 제목\n> 본문',
      );
      expect(Object.keys(review({ reviewId: 'x' })).sort()).toEqual([
        'appVersion',
        'body',
        'lastModifiedAt',
        'rating',
        'reviewId',
        'store',
        'territoryOrLanguage',
        'title',
      ]);
    });
  });
});
