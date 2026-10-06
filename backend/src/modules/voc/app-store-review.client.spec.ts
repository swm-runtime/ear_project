import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import {
  AppStoreCustomerReviewsResponse,
  AppStoreReviewClient,
  createAppStoreConnectToken,
  normalizeAppStoreReviews,
} from './app-store-review.client';
import { APP_STORE_CONNECT_TOKEN_TTL_SEC } from './voc.constant';
import { ReviewStore } from './voc.enum';
import { StoreReviewFetchError } from './voc.types';

const NOW = new Date('2026-10-06T03:00:00Z');

/** 테스트용 P-256 키 — Apple 팀 키(.p8)와 같은 곡선 */
const { privateKey: PRIVATE_KEY_PEM } = (() => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  return {
    privateKey: pair.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
  };
})();

const CREDENTIALS = {
  issuerId: 'issuer-1',
  keyId: 'KEY123',
  privateKey: PRIVATE_KEY_PEM,
};

const decodeSegment = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

describe('createAppStoreConnectToken', () => {
  it('헤더에 kid·ES256, 페이로드에 iss·aud·exp(20분 이내)를 넣는다', () => {
    // when
    const token = createAppStoreConnectToken(CREDENTIALS, NOW);
    const [headerSegment, payloadSegment] = token.split('.');
    const header = decodeSegment(headerSegment);
    const payload = decodeSegment(payloadSegment);

    // then
    expect(header).toEqual({ alg: 'ES256', kid: 'KEY123', typ: 'JWT' });
    expect(payload.iss).toBe('issuer-1');
    expect(payload.aud).toBe('appstoreconnect-v1');
    const issuedAt = Math.floor(NOW.getTime() / 1000);
    expect(payload.iat).toBe(issuedAt);
    expect(payload.exp).toBe(issuedAt + APP_STORE_CONNECT_TOKEN_TTL_SEC);
    expect((payload.exp as number) - issuedAt).toBeLessThanOrEqual(20 * 60);
  });

  it('서명은 r||s 형식이라 공개키로 검증된다', () => {
    // given
    const token = createAppStoreConnectToken(CREDENTIALS, NOW);
    const [headerSegment, payloadSegment, signatureSegment] = token.split('.');

    // when
    const isValid = verify(
      'sha256',
      Buffer.from(`${headerSegment}.${payloadSegment}`),
      {
        key: createPublicKey(PRIVATE_KEY_PEM),
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(signatureSegment, 'base64url'),
    );

    // then
    expect(isValid).toBe(true);
    expect(Buffer.from(signatureSegment, 'base64url')).toHaveLength(64);
  });
});

describe('normalizeAppStoreReviews', () => {
  const response: AppStoreCustomerReviewsResponse = {
    data: [
      {
        id: 'review-a',
        attributes: {
          rating: 4,
          title: ' 좋아요 ',
          body: '출근길에 듣기 좋아요',
          createdDate: '2026-10-05T12:00:00Z',
          territory: 'KOR',
          reviewerNickname: '닉네임은버린다',
        },
      },
      {
        id: 'review-b',
        attributes: {
          rating: 2,
          title: null,
          body: null,
          createdDate: '2026-10-04T12:00:00Z',
          territory: null,
        },
      },
    ],
  };

  it('Apple 응답을 공통 모양으로 바꾼다 — 닉네임은 어디에도 남지 않는다', () => {
    // when
    const items = normalizeAppStoreReviews(response);

    // then
    expect(items[0]).toEqual({
      store: ReviewStore.APP_STORE,
      reviewId: 'review-a',
      rating: 4,
      title: '좋아요',
      body: '출근길에 듣기 좋아요',
      lastModifiedAt: new Date('2026-10-05T12:00:00Z'),
      appVersion: null,
      territoryOrLanguage: 'KOR',
    });
    expect(JSON.stringify(items)).not.toContain('닉네임은버린다');
  });

  it('제목·본문·국가가 없으면 null·빈 문자열로 둔다', () => {
    // when
    const [, item] = normalizeAppStoreReviews(response);

    // then
    expect(item.title).toBeNull();
    expect(item.body).toBe('');
    expect(item.territoryOrLanguage).toBeNull();
  });

  it('식별자·별점·작성일 중 하나라도 없는 항목은 버린다', () => {
    // given
    const broken: AppStoreCustomerReviewsResponse = {
      data: [
        { attributes: { rating: 5, createdDate: '2026-10-05T00:00:00Z' } },
        {
          id: 'no-rating',
          attributes: { createdDate: '2026-10-05T00:00:00Z' },
        },
        {
          id: 'bad-date',
          attributes: { rating: 5, createdDate: 'not-a-date' },
        },
      ],
    };

    // when / then
    expect(normalizeAppStoreReviews(broken)).toEqual([]);
    expect(normalizeAppStoreReviews({})).toEqual([]);
  });
});

/** 네트워크 없이 응답을 갈아 끼우는 하네스 */
class FakeAppStoreReviewClient extends AppStoreReviewClient {
  requestedUrl = '';
  requestedToken = '';

  constructor(
    env: Record<string, string>,
    private readonly answer: () => Promise<AppStoreCustomerReviewsResponse>,
  ) {
    super({ get: (key: string) => env[key] } as unknown as ConfigService<
      never,
      true
    >);
  }

  protected override requestJson(
    url: string,
    token: string,
  ): Promise<AppStoreCustomerReviewsResponse> {
    this.requestedUrl = url;
    this.requestedToken = token;

    return this.answer();
  }
}

const FULL_ENV = {
  APP_STORE_CONNECT_ISSUER_ID: 'issuer-1',
  APP_STORE_CONNECT_KEY_ID: 'KEY123',
  APP_STORE_CONNECT_PRIVATE_KEY_BASE64:
    Buffer.from(PRIVATE_KEY_PEM).toString('base64'),
  APP_STORE_APP_APPLE_ID: '6740000000',
};

describe('AppStoreReviewClient', () => {
  describe('isEnabled', () => {
    it('팀 키 셋과 앱 Apple ID가 전부 있어야 켜진다', () => {
      expect(
        new FakeAppStoreReviewClient(FULL_ENV, () =>
          Promise.resolve({}),
        ).isEnabled(),
      ).toBe(true);
    });

    it.each([
      'APP_STORE_CONNECT_ISSUER_ID',
      'APP_STORE_CONNECT_KEY_ID',
      'APP_STORE_CONNECT_PRIVATE_KEY_BASE64',
      'APP_STORE_APP_APPLE_ID',
    ])('%s가 비면 꺼진다', (missing) => {
      const env = { ...FULL_ENV, [missing]: '  ' };

      expect(
        new FakeAppStoreReviewClient(env, () =>
          Promise.resolve({}),
        ).isEnabled(),
      ).toBe(false);
    });
  });

  describe('fetchRecentReviews', () => {
    it('최신순·50건·닉네임 없는 필드로 요청하고 토큰을 싣는다', async () => {
      // given
      const client = new FakeAppStoreReviewClient(FULL_ENV, () =>
        Promise.resolve({
          data: [
            {
              id: 'r1',
              attributes: {
                rating: 5,
                body: 'good',
                createdDate: '2026-10-05T00:00:00Z',
              },
            },
          ],
        }),
      );

      // when
      const items = await client.fetchRecentReviews(NOW);

      // then
      expect(items).toHaveLength(1);
      expect(client.requestedUrl).toContain('/apps/6740000000/customerReviews');
      expect(client.requestedUrl).toContain('sort=-createdDate');
      expect(client.requestedUrl).toContain('limit=50');
      expect(decodeURIComponent(client.requestedUrl)).toContain(
        'fields[customerReviews]=rating,title,body,createdDate,territory',
      );
      expect(decodeURIComponent(client.requestedUrl)).not.toContain(
        'reviewerNickname',
      );
      expect(client.requestedToken.split('.')).toHaveLength(3);
    });

    it('꺼져 있으면 요청하지 않고 빈 배열을 돌려준다', async () => {
      // given
      const answer = jest.fn();
      const client = new FakeAppStoreReviewClient(
        { ...FULL_ENV, APP_STORE_CONNECT_KEY_ID: '' },
        answer,
      );

      // when / then
      await expect(client.fetchRecentReviews(NOW)).resolves.toEqual([]);
      expect(answer).not.toHaveBeenCalled();
    });

    it('401·403은 자격증명 실패, 429·5xx는 일시 실패로 분류해 올린다', async () => {
      // given
      const failing = (status: number) =>
        new FakeAppStoreReviewClient(FULL_ENV, () =>
          Promise.reject(
            new StoreReviewFetchError(ReviewStore.APP_STORE, status),
          ),
        );

      // when / then
      await expect(failing(401).fetchRecentReviews(NOW)).rejects.toMatchObject({
        kind: 'credential',
        status: 401,
      });
      await expect(failing(403).fetchRecentReviews(NOW)).rejects.toMatchObject({
        kind: 'credential',
      });
      await expect(failing(429).fetchRecentReviews(NOW)).rejects.toMatchObject({
        kind: 'transient',
      });
      await expect(failing(503).fetchRecentReviews(NOW)).rejects.toMatchObject({
        kind: 'transient',
      });
    });
  });
});
