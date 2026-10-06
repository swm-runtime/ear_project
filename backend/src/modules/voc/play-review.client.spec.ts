import { ConfigService } from '@nestjs/config';

import {
  normalizePlayReviews,
  PlayReviewClient,
  PlayReviewsListResponse,
  statusOf,
} from './play-review.client';
import { ReviewStore } from './voc.enum';
import { StoreReviewFetchError } from './voc.types';

const RESPONSE: PlayReviewsListResponse = {
  reviews: [
    {
      reviewId: 'gp:AOqpTOE-abc',
      authorName: '작성자이름은버린다',
      comments: [
        {
          userComment: {
            text: '(번역) 좋은 앱',
            originalText: 'Great app',
            lastModified: { seconds: '1759708800', nanos: 0 },
            starRating: 5,
            appVersionName: '1.2.0',
            reviewerLanguage: 'en',
            device: 'pixel',
          },
        },
        { developerComment: { text: '감사합니다' } },
      ],
    },
    {
      reviewId: 'gp:AOqpTOE-def',
      comments: [
        {
          userComment: {
            text: '처음 글',
            lastModified: { seconds: 1759600000 },
            starRating: 2,
          },
        },
        {
          userComment: {
            text: '수정한 글',
            lastModified: { seconds: 1759700000 },
            starRating: 3,
          },
        },
      ],
    },
  ],
};

describe('normalizePlayReviews', () => {
  it('Google 응답을 공통 모양으로 바꾼다 — 원문을 본문으로 쓰고 작성자 이름은 남기지 않는다', () => {
    // when
    const [item] = normalizePlayReviews(RESPONSE);

    // then
    expect(item).toEqual({
      store: ReviewStore.PLAY_STORE,
      reviewId: 'gp:AOqpTOE-abc',
      rating: 5,
      title: null,
      body: 'Great app',
      lastModifiedAt: new Date(1759708800 * 1000),
      appVersion: '1.2.0',
      territoryOrLanguage: 'en',
    });
    expect(JSON.stringify(normalizePlayReviews(RESPONSE))).not.toContain(
      '작성자이름은버린다',
    );
  });

  it('사용자 댓글이 여럿이면 가장 나중에 수정된 것을 쓴다', () => {
    // when
    const [, item] = normalizePlayReviews(RESPONSE);

    // then
    expect(item.rating).toBe(3);
    expect(item.body).toBe('수정한 글');
    expect(item.lastModifiedAt).toEqual(new Date(1759700000 * 1000));
    expect(item.appVersion).toBeNull();
    expect(item.territoryOrLanguage).toBeNull();
  });

  it('식별자·사용자 댓글·별점·수정 시각 중 하나라도 없는 리뷰는 버린다', () => {
    // given
    const broken: PlayReviewsListResponse = {
      reviews: [
        {
          comments: [
            { userComment: { starRating: 5, lastModified: { seconds: 1 } } },
          ],
        },
        { reviewId: 'only-dev', comments: [{ developerComment: {} }] },
        {
          reviewId: 'no-rating',
          comments: [{ userComment: { lastModified: { seconds: 1 } } }],
        },
        { reviewId: 'no-time', comments: [{ userComment: { starRating: 4 } }] },
      ],
    };

    // when / then
    expect(normalizePlayReviews(broken)).toEqual([]);
    expect(normalizePlayReviews({})).toEqual([]);
  });
});

describe('statusOf', () => {
  const PLAY_URL =
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app/reviews';

  it('Play API가 답한 상태는 그대로 쓴다', () => {
    expect(
      statusOf({ response: { status: 429 }, config: { url: PLAY_URL } }),
    ).toBe(429);
    expect(
      statusOf({
        response: { status: 403 },
        config: { url: new URL(PLAY_URL) },
      }),
    ).toBe(403);
  });

  it('토큰 발급 주소의 오류(400 invalid_grant)는 자격증명 실패(401)로 올린다', () => {
    expect(
      statusOf({
        response: { status: 400 },
        config: { url: 'https://oauth2.googleapis.com/token' },
      }),
    ).toBe(401);
  });

  it('응답이 없었으면 null이다', () => {
    expect(statusOf(new Error('socket hang up'))).toBeNull();
    expect(statusOf(null)).toBeNull();
  });
});

const SERVICE_ACCOUNT_BASE64 = Buffer.from(
  JSON.stringify({ client_email: 'svc@example.iam', private_key: 'pem' }),
).toString('base64');

class FakePlayReviewClient extends PlayReviewClient {
  requestedUrl = '';

  constructor(
    env: Record<string, string>,
    private readonly answer: () => Promise<PlayReviewsListResponse>,
  ) {
    super({ get: (key: string) => env[key] } as unknown as ConfigService<
      never,
      true
    >);
  }

  protected override requestJson(
    url: string,
  ): Promise<PlayReviewsListResponse> {
    this.requestedUrl = url;

    return this.answer();
  }
}

const FULL_ENV = {
  GOOGLE_PLAY_PACKAGE_NAME: 'com.example.ear',
  GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64: SERVICE_ACCOUNT_BASE64,
};

describe('PlayReviewClient', () => {
  describe('isEnabled', () => {
    it('패키지명과 서비스 계정이 둘 다 있어야 켜진다', () => {
      expect(
        new FakePlayReviewClient(FULL_ENV, () =>
          Promise.resolve({}),
        ).isEnabled(),
      ).toBe(true);
    });

    it('서비스 계정 JSON이 깨졌거나 비면 꺼진다', () => {
      expect(
        new FakePlayReviewClient(
          {
            ...FULL_ENV,
            GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64: 'not-base64-json',
          },
          () => Promise.resolve({}),
        ).isEnabled(),
      ).toBe(false);
      expect(
        new FakePlayReviewClient(
          { ...FULL_ENV, GOOGLE_PLAY_PACKAGE_NAME: '' },
          () => Promise.resolve({}),
        ).isEnabled(),
      ).toBe(false);
    });
  });

  describe('fetchRecentReviews', () => {
    it('패키지의 리뷰 목록을 100건·한국어 번역으로 요청한다', async () => {
      // given
      const client = new FakePlayReviewClient(FULL_ENV, () =>
        Promise.resolve(RESPONSE),
      );

      // when
      const items = await client.fetchRecentReviews();

      // then
      expect(items).toHaveLength(2);
      expect(client.requestedUrl).toContain(
        '/applications/com.example.ear/reviews',
      );
      expect(client.requestedUrl).toContain('maxResults=100');
      expect(client.requestedUrl).toContain('translationLanguage=ko');
    });

    it('꺼져 있으면 요청하지 않는다', async () => {
      // given
      const answer = jest.fn();
      const client = new FakePlayReviewClient(
        { ...FULL_ENV, GOOGLE_PLAY_PACKAGE_NAME: '' },
        answer,
      );

      // when / then
      await expect(client.fetchRecentReviews()).resolves.toEqual([]);
      expect(answer).not.toHaveBeenCalled();
    });

    it('조회 실패는 StoreReviewFetchError로 올라온다', async () => {
      // given
      const client = new FakePlayReviewClient(FULL_ENV, () =>
        Promise.reject(new StoreReviewFetchError(ReviewStore.PLAY_STORE, 500)),
      );

      // when / then
      await expect(client.fetchRecentReviews()).rejects.toMatchObject({
        store: ReviewStore.PLAY_STORE,
        kind: 'transient',
      });
    });
  });
});
