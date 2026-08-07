import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { StatsPeriodType } from '@/modules/content/content.enum';

import {
  decodeExploreCursor,
  decodePopularCursor,
  encodeExploreCursor,
  encodePopularCursor,
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
        JSON.stringify({ t: PUBLISHED_AT.toISOString(), i: CONTENT_ID, q: '' }),
        'utf8',
      ).toString('base64url');

      // when
      const error = catchError(() => decodeExploreCursor(broken, []));

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });
  });
});
