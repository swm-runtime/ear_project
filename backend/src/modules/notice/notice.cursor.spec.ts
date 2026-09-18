import { ErrorCode } from '@/common/exceptions/error-code.enum';

import {
  decodeAdminNoticeCursor,
  decodePublishedNoticeCursor,
  encodeAdminNoticeCursor,
  encodePublishedNoticeCursor,
} from './notice.cursor';

const ID = '11111111-1111-4111-8111-111111111111';
const AT = new Date('2026-09-17T09:00:00.000Z');

describe('noticeCursor', () => {
  it('사용자 목록 커서는 인코딩한 위치를 그대로 되돌린다', () => {
    // given
    const cursor = encodePublishedNoticeCursor({
      isPinned: true,
      publishedAt: AT,
      id: ID,
    });

    // when
    const position = decodePublishedNoticeCursor(cursor);

    // then
    expect(position).toEqual({ isPinned: true, publishedAt: AT, id: ID });
  });

  it('관리자 목록 커서를 사용자 목록에 넣으면 거절한다', () => {
    // given — 정렬이 달라 섞이면 중복·누락이 생긴다
    const cursor = encodeAdminNoticeCursor({ createdAt: AT, id: ID });

    // when
    const act = () => decodePublishedNoticeCursor(cursor);

    // then
    expect(act).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.NOTICE_CURSOR_INVALID,
      }) as Error,
    );
  });

  it('형식이 깨진 커서는 400 으로 거절한다 — SQL 에 닿으면 500 이 된다', () => {
    // given
    const broken = Buffer.from(
      JSON.stringify({ k: 'a', c: 'not-a-date', i: 'x' }),
    ).toString('base64url');

    // when
    const acts = [
      () => decodeAdminNoticeCursor(broken),
      () => decodeAdminNoticeCursor('%%%'),
    ];

    // then
    for (const act of acts) {
      expect(act).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.NOTICE_CURSOR_INVALID,
        }) as Error,
      );
    }
  });
});
