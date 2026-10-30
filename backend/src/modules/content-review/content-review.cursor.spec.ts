import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { BusinessException } from '@/common/exceptions/business.exception';
import { UserMarket } from '@/modules/user/user.enum';

import {
  decodeContentReviewCursor,
  encodeContentReviewCursor,
} from './content-review.cursor';

const FILTER = { contentId: null, market: UserMarket.KR, hasText: true };
const POSITION = {
  updatedAt: '2026-10-28T23:10:00.123456Z',
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
};

function decodeError(cursor: string, filter = FILTER): BusinessException {
  try {
    decodeContentReviewCursor(cursor, filter);
  } catch (error) {
    return error as BusinessException;
  }
  throw new Error('예외가 나지 않았다');
}

describe('content-review.cursor', () => {
  it('같은 필터로 되돌리면 위치가 그대로다 — 마이크로초를 잃지 않는다', () => {
    expect(
      decodeContentReviewCursor(
        encodeContentReviewCursor(POSITION, FILTER),
        FILTER,
      ),
    ).toEqual(POSITION);
  });

  it('필터가 바뀐 커서는 400 VALIDATION_FAILED 다', () => {
    const cursor = encodeContentReviewCursor(POSITION, FILTER);

    expect(decodeError(cursor, { ...FILTER, hasText: false }).errorCode).toBe(
      ErrorCode.VALIDATION_FAILED,
    );
  });

  it.each([
    ['base64 아님', '%%%'],
    ['JSON 아님', Buffer.from('nope').toString('base64url')],
    [
      'id 가 uuid 아님',
      Buffer.from(
        JSON.stringify({ u: POSITION.updatedAt, i: 'x', q: '-|kr|true' }),
      ).toString('base64url'),
    ],
    [
      '시각 형식이 다름',
      Buffer.from(
        JSON.stringify({ u: '2026-10-28', i: POSITION.id, q: '-|kr|true' }),
      ).toString('base64url'),
    ],
  ])('해석할 수 없는 커서(%s)는 400 이다', (_label, cursor) => {
    expect(decodeError(cursor).errorCode).toBe(ErrorCode.VALIDATION_FAILED);
  });
});
