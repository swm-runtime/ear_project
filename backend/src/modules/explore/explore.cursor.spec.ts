import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { StatsPeriodType } from '@/modules/content/content.enum';

import {
  decodeAnySearchCursor,
  decodeExploreCursor,
  decodePopularCursor,
  decodeSearchCursor,
  encodeExploreCursor,
  encodeHybridSearchCursor,
  encodePopularCursor,
  encodeSearchCursor,
} from './explore.cursor';

const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_B = 'bbbbbbbb-1111-4111-8111-111111111111';
const CONTENT_ID = 'cccccccc-1111-4111-8111-111111111111';
const PUBLISHED_AT = new Date('2026-08-03T21:10:00.000Z');

const POSITION = {
  playCount: 12,
  publishedAt: PUBLISHED_AT,
  id: CONTENT_ID,
};

function catchError(run: () => unknown): BusinessException {
  try {
    run();
  } catch (error) {
    return error as BusinessException;
  }

  throw new Error('예외가 발생하지 않았다');
}

describe('exploreCursor', () => {
  describe('encode · decode', () => {
    it('발급한 커서를 같은 조건으로 해석하면 원래 위치가 나온다', () => {
      // given
      const cursor = encodeExploreCursor(POSITION, [TOPIC_A]);

      // when
      const position = decodeExploreCursor(cursor, [TOPIC_A]);

      // then
      expect(position).toEqual(POSITION);
    });

    it('주제 순서만 다르면 같은 커서로 인정한다', () => {
      // given — 조건을 정렬해 보내야 한다는 숨은 규칙을 클라이언트에 만들지 않는다
      const cursor = encodeExploreCursor(POSITION, [TOPIC_A, TOPIC_B]);

      // when
      const position = decodeExploreCursor(cursor, [TOPIC_B, TOPIC_A]);

      // then
      expect(position.id).toBe(CONTENT_ID);
    });
  });

  describe('decode', () => {
    it('발급 시점과 주제가 다르면 거절한다', () => {
      // given — 조건이 바뀐 커서를 이어 쓰면 두 조건이 섞인 목록이 만들어진다
      const cursor = encodeExploreCursor(POSITION, [TOPIC_A]);

      // when
      const error = catchError(() =>
        decodeExploreCursor(cursor, [TOPIC_A, TOPIC_B]),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });

    it('형식이 깨진 커서도 같은 코드로 거절한다', () => {
      // given — 클라이언트는 커서를 버리고 첫 페이지부터 조용히 재조회한다

      // when
      const error = catchError(() =>
        decodeExploreCursor('not-a-cursor', [TOPIC_A]),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });

    it('인기 커서는 구간이 다르면 거절한다', () => {
      // given — 구간이 바뀐 커서를 이어 쓰면 두 구간이 섞인 목록이 된다
      const cursor = encodePopularCursor(
        { ...POSITION, completeCount: 4 },
        StatsPeriodType.WEEK,
      );

      // when
      const error = catchError(() =>
        decodePopularCursor(cursor, StatsPeriodType.MONTH),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });

    it('인기 커서는 완청 수까지 담아 되돌린다', () => {
      // given — 확정 구간이 없으면 재생 수가 전부 0이라 완청 수가 실제 tie-break가 된다
      const cursor = encodePopularCursor(
        { ...POSITION, completeCount: 4 },
        StatsPeriodType.ALL,
      );

      // when
      const position = decodePopularCursor(cursor, StatsPeriodType.ALL);

      // then
      expect(position).toEqual({ ...POSITION, completeCount: 4 });
    });

    it('완청 수가 빠진 인기 커서를 받아들이지 않는다', () => {
      // given — 정렬 키가 모자라면 페이지 경계가 어긋난다
      const broken = Buffer.from(
        JSON.stringify({
          p: 3,
          t: PUBLISHED_AT.toISOString(),
          i: CONTENT_ID,
          q: StatsPeriodType.ALL,
        }),
        'utf8',
      ).toString('base64url');

      // when
      const error = catchError(() =>
        decodePopularCursor(broken, StatsPeriodType.ALL),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });

    it('정렬 키가 빠진 커서를 받아들이지 않는다', () => {
      // given — 랭킹 값이 없으면 keyset 조건을 만들 수 없다
      const broken = Buffer.from(
        JSON.stringify({
          t: PUBLISHED_AT.toISOString(),
          i: CONTENT_ID,
          q: 'x',
        }),
        'utf8',
      ).toString('base64url');

      // when
      const error = catchError(() => decodeExploreCursor(broken, []));

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });
  });

  describe('search cursor', () => {
    const SEARCH_POSITION = {
      score: 12,
      titleSimilarity: 0.4375,
      playCount: 7,
      publishedAt: PUBLISHED_AT,
      id: CONTENT_ID,
    };

    it('발급한 커서를 같은 질의·주제로 해석하면 다섯 정렬 키가 그대로 나온다', () => {
      // given
      const cursor = encodeSearchCursor(SEARCH_POSITION, '커리어', [TOPIC_A]);

      // when
      const position = decodeSearchCursor(cursor, '커리어', [TOPIC_A]);

      // then
      expect(position).toEqual(SEARCH_POSITION);
    });

    it('발급 시점과 질의가 다르면 거절한다', () => {
      // given — 조건이 바뀐 커서를 이어 쓰면 두 질의가 섞인 목록이 된다
      const cursor = encodeSearchCursor(SEARCH_POSITION, '커리어', []);

      // when
      const error = catchError(() => decodeSearchCursor(cursor, '이직', []));

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });

    it('발급 시점과 주제 필터가 다르면 거절한다', () => {
      // given
      const cursor = encodeSearchCursor(SEARCH_POSITION, '커리어', [TOPIC_A]);

      // when
      const error = catchError(() =>
        decodeSearchCursor(cursor, '커리어', [TOPIC_B]),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });

    it('주제 순서만 다르면 같은 커서로 인정한다', () => {
      // given — 정렬해 지문을 만들므로 순서는 조건이 아니다
      const cursor = encodeSearchCursor(SEARCH_POSITION, '커리어', [
        TOPIC_A,
        TOPIC_B,
      ]);

      // when
      const position = decodeSearchCursor(cursor, '커리어', [TOPIC_B, TOPIC_A]);

      // then
      expect(position.id).toBe(CONTENT_ID);
    });

    it('정렬 키가 빠진 검색 커서를 받아들이지 않는다', () => {
      // given — 제목 유사도가 없으면 동점 해소 keyset 조건을 만들 수 없다
      const broken = Buffer.from(
        JSON.stringify({
          s: 8,
          p: 0,
          t: PUBLISHED_AT.toISOString(),
          i: CONTENT_ID,
          q: '커리어|',
        }),
        'utf8',
      ).toString('base64url');

      // when
      const error = catchError(() => decodeSearchCursor(broken, '커리어', []));

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });
  });

  /**
   * 커서는 서명되지 않아 인증된 사용자 누구나 내용을 고쳐 보낼 수 있다.
   * **형식만 맞고 값이 이상한 커서**가 그대로 SQL 비교식에 들어가면 Postgres가 던지고,
   * 전역 필터가 500 `INTERNAL_ERROR`(`retryable: true`)로 바꿔 **클라이언트가 같은 커서로
   * 무한 재시도**한다. 계약은 400이다.
   */
  describe('값을 고친 커서', () => {
    const encode = (payload: Record<string, unknown>): string =>
      Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    it.each([
      [
        'uuid가 아닌 id',
        { p: 1, t: PUBLISHED_AT.toISOString(), i: 'x', q: 'x' },
      ],
      [
        '소수 재생 수',
        { p: 1.5, t: PUBLISHED_AT.toISOString(), i: CONTENT_ID, q: 'x' },
      ],
      [
        '음수 재생 수',
        { p: -1, t: PUBLISHED_AT.toISOString(), i: CONTENT_ID, q: 'x' },
      ],
      [
        'int4를 넘는 재생 수',
        { p: 1e308, t: PUBLISHED_AT.toISOString(), i: CONTENT_ID, q: 'x' },
      ],
      ['해석되지 않는 시각', { p: 1, t: 'not-a-date', i: CONTENT_ID, q: 'x' }],
      [
        'Postgres 범위 밖의 시각(기원전) — 파싱은 되지만 SQL이 던진다',
        { p: 1, t: '-005000-01-01T00:00:00.000Z', i: CONTENT_ID, q: 'x' },
      ],
    ])('%s는 400으로 거절한다', (_label, payload) => {
      // when
      const error = catchError(() =>
        decodeExploreCursor(encode(payload), [TOPIC_A]),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
      expect(error.getStatus()).toBe(400);
    });
  });

  describe('하이브리드 검색 커서(KAN-238)', () => {
    const HYBRID_POSITION = {
      order: 'rrf' as const,
      rrf: 1 / 61 + 1 / 62,
      playCount: 4,
      publishedAt: PUBLISHED_AT,
      id: CONTENT_ID,
    };
    const STATE = {
      queryUsed: '커리어',
      corrected: true,
      match: 'keyword' as const,
      semantic: true,
    };

    it('RRF 점수(float8)·검색 상태가 왕복 그대로다 — 키셋 재비교가 어긋나지 않는다', () => {
      // given
      const cursor = encodeHybridSearchCursor(
        HYBRID_POSITION,
        STATE,
        '커리오',
        [TOPIC_B, TOPIC_A],
        false,
      );

      // when — 주제 순서가 달라도 같은 조건이다
      const decoded = decodeAnySearchCursor(
        cursor,
        '커리오',
        [TOPIC_A, TOPIC_B],
        false,
      );

      // then
      expect(decoded).toEqual({
        kind: 'hybrid',
        position: HYBRID_POSITION,
        state: STATE,
      });
    });

    it('교정하지 않았으면 교정어를 싣지 않고 실제 검색어는 입력 질의다', () => {
      // given
      const cursor = encodeHybridSearchCursor(
        HYBRID_POSITION,
        { ...STATE, queryUsed: '커리어', corrected: false },
        '커리어',
        [],
        false,
      );

      // when
      const payload = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      const decoded = decodeAnySearchCursor(cursor, '커리어', [], false);

      // then
      expect(payload).not.toHaveProperty('u');
      expect(decoded).toMatchObject({
        state: { queryUsed: '커리어', corrected: false },
      });
    });

    it('100자 질의 + 긴 교정어도 커서 길이 상한(512자) 안이다 — 질의는 해시로 담는다', () => {
      // given
      const cursor = encodeHybridSearchCursor(
        HYBRID_POSITION,
        { ...STATE, queryUsed: '가'.repeat(30) },
        '나'.repeat(100),
        [TOPIC_A],
        false,
      );

      // then
      expect(cursor.length).toBeLessThanOrEqual(512);
    });

    it.each([
      ['질의', '커리어', [], false],
      ['주제 필터', '커리오', [TOPIC_A], false],
      ['exact', '커리오', [], true],
    ])('발급 때와 %s가 다르면 거절한다', (_label, query, topics, exact) => {
      // given
      const cursor = encodeHybridSearchCursor(
        HYBRID_POSITION,
        STATE,
        '커리오',
        [],
        false,
      );

      // when
      const error = catchError(() =>
        decodeAnySearchCursor(cursor, query, topics, exact),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });

    it('종전 키워드 커서는 legacy로 해석한다 — exact와 무관하게 받는다', () => {
      // given — 1.3.0까지의 서버가 발급하던 모양
      const legacy = encodeSearchCursor(
        {
          score: 16,
          titleSimilarity: 0.5,
          playCount: 1,
          publishedAt: PUBLISHED_AT,
          id: CONTENT_ID,
        },
        '커리어',
        [],
      );

      // when
      const decoded = decodeAnySearchCursor(legacy, '커리어', [], true);

      // then
      expect(decoded).toEqual({
        kind: 'legacy',
        position: {
          score: 16,
          titleSimilarity: 0.5,
          playCount: 1,
          publishedAt: PUBLISHED_AT,
          id: CONTENT_ID,
        },
      });
    });

    it('종전 커서도 질의가 다르면 거절한다', () => {
      // given
      const legacy = encodeSearchCursor(
        {
          score: 16,
          titleSimilarity: 0.5,
          playCount: 1,
          publishedAt: PUBLISHED_AT,
          id: CONTENT_ID,
        },
        '커리어',
        [],
      );

      // when
      const error = catchError(() =>
        decodeAnySearchCursor(legacy, '면접', [], false),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });

    it.each([
      ['RRF 0', { r: 0 }],
      ['RRF 음수', { r: -0.1 }],
      ['RRF 문자열', { r: '0.01' }],
      ['모르는 match', { m: 'similar' }],
      ['semantic 누락', { s: undefined }],
      ['빈 교정어', { u: '' }],
      ['uuid 아닌 id', { i: 'x' }],
      ['RRF 커서를 키워드 순서 버전으로', { v: 3 }],
      ['모르는 버전', { v: 4 }],
    ])('%s 값을 고친 하이브리드 커서는 400으로 거절한다', (_label, patch) => {
      // given
      const cursor = encodeHybridSearchCursor(
        HYBRID_POSITION,
        STATE,
        '커리오',
        [],
        false,
      );
      const payload = {
        ...(JSON.parse(
          Buffer.from(cursor, 'base64url').toString('utf8'),
        ) as Record<string, unknown>),
        ...patch,
      };
      const tampered = Buffer.from(JSON.stringify(payload), 'utf8').toString(
        'base64url',
      );

      // when
      const error = catchError(() =>
        decodeAnySearchCursor(tampered, '커리오', [], false),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
      expect(error.getStatus()).toBe(400);
    });
  });

  describe('키워드 순서 하이브리드 커서(KAN-242 — 질의 벡터 없이 시작한 검색)', () => {
    const KEYWORD_POSITION = {
      order: 'keyword' as const,
      score: 16,
      titleSimilarity: 0.4285714285714286,
      playCount: 2,
      publishedAt: PUBLISHED_AT,
      id: CONTENT_ID,
    };
    const STATE = {
      queryUsed: '커리어',
      corrected: true,
      match: 'keyword' as const,
      semantic: false,
    };
    const encodeKeyword = () =>
      encodeHybridSearchCursor(KEYWORD_POSITION, STATE, '커리오', [], false);
    const tamper = (cursor: string, patch: Record<string, unknown>) =>
      Buffer.from(
        JSON.stringify({
          ...(JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8'),
          ) as Record<string, unknown>),
          ...patch,
        }),
        'utf8',
      ).toString('base64url');

    it('종전 키워드 정렬 키(가중 합·제목 유사도 float8)와 검색 상태가 왕복 그대로다 — RRF 커서와 버전으로 갈린다', () => {
      // given
      const cursor = encodeKeyword();

      // when
      const payload = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      const decoded = decodeAnySearchCursor(cursor, '커리오', [], false);

      // then
      expect(payload.v).toBe(3);
      expect(payload).not.toHaveProperty('r');
      expect(decoded).toEqual({
        kind: 'hybrid',
        position: KEYWORD_POSITION,
        state: STATE,
      });
    });

    it('의미 엔진을 쓴 검색 상태로는 발급하지 않는다 — 척도가 다른 정렬을 섞지 않는다', () => {
      // when
      const issue = () =>
        encodeHybridSearchCursor(
          KEYWORD_POSITION,
          { ...STATE, semantic: true },
          '커리오',
          [],
          false,
        );

      // then
      expect(issue).toThrow();
    });

    it('100자 질의 + 긴 교정어도 커서 길이 상한(512자) 안이다', () => {
      // given
      const cursor = encodeHybridSearchCursor(
        KEYWORD_POSITION,
        { ...STATE, queryUsed: '가'.repeat(30) },
        '나'.repeat(100),
        [TOPIC_A],
        false,
      );

      // then
      expect(cursor.length).toBeLessThanOrEqual(512);
    });

    it.each([
      ['semantic 참', { s: true }],
      ['semantic 누락', { s: undefined }],
      ['가중 합 소수', { k: 1.5 }],
      ['가중 합 음수', { k: -1 }],
      ['제목 유사도 1 초과', { w: 1.5 }],
      ['제목 유사도 누락', { w: undefined }],
      ['키워드 순서 커서를 RRF 버전으로', { v: 2 }],
    ])('%s 값을 고친 키워드 순서 커서는 400으로 거절한다', (_label, patch) => {
      // when
      const error = catchError(() =>
        decodeAnySearchCursor(
          tamper(encodeKeyword(), patch),
          '커리오',
          [],
          false,
        ),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
      expect(error.getStatus()).toBe(400);
    });

    it('발급 때와 질의가 다르면 거절한다', () => {
      // when
      const error = catchError(() =>
        decodeAnySearchCursor(encodeKeyword(), '커리어', [], false),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });
  });
});
