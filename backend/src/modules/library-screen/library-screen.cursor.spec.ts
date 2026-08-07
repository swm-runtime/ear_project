import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  LibraryItemFilter,
  LibraryItemSort,
} from '@/modules/library/library.enum';

import {
  CursorConditions,
  decodeLibraryCursor,
  encodeLibraryCursor,
} from './library-screen.cursor';

const ADDED_AT = new Date('2026-08-03T21:10:00.000Z');
const ITEM_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

const CONDITIONS: CursorConditions = {
  filter: LibraryItemFilter.ALL,
  sort: LibraryItemSort.ADDED_DESC,
  topicIds: [],
};

function catchError(run: () => unknown): BusinessException {
  try {
    run();
  } catch (error) {
    return error as BusinessException;
  }

  throw new Error('예외가 발생하지 않았다');
}

describe('libraryScreenCursor', () => {
  describe('decodeLibraryCursor', () => {
    it('발급한 커서를 같은 조건으로 읽으면 위치가 그대로 나온다', () => {
      // given
      const cursor = encodeLibraryCursor(
        { addedAt: ADDED_AT, id: ITEM_ID },
        CONDITIONS,
      );

      // when
      const position = decodeLibraryCursor(cursor, CONDITIONS);

      // then
      expect(position).toEqual({ addedAt: ADDED_AT, id: ITEM_ID });
    });

    it('탭이 바뀐 커서는 거절한다', () => {
      // given — 조건이 바뀐 커서를 이어 쓰면 두 조건이 섞인 목록이 만들어진다
      const cursor = encodeLibraryCursor(
        { addedAt: ADDED_AT, id: ITEM_ID },
        CONDITIONS,
      );

      // when
      const error = catchError(() =>
        decodeLibraryCursor(cursor, {
          ...CONDITIONS,
          filter: LibraryItemFilter.DRIP,
        }),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.LIBRARY_CURSOR_INVALID);
    });

    it('주제 필터가 바뀐 커서는 거절한다', () => {
      // given
      const cursor = encodeLibraryCursor(
        { addedAt: ADDED_AT, id: ITEM_ID },
        { ...CONDITIONS, topicIds: ['topic-a'] },
      );

      // when
      const error = catchError(() =>
        decodeLibraryCursor(cursor, {
          ...CONDITIONS,
          topicIds: ['topic-a', 'topic-b'],
        }),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.LIBRARY_CURSOR_INVALID);
    });

    it('같은 주제를 다른 순서로 보내도 커서를 이어 쓸 수 있다', () => {
      // given — 조건을 정렬해 보내야 한다는 숨은 규칙을 만들지 않는다
      const cursor = encodeLibraryCursor(
        { addedAt: ADDED_AT, id: ITEM_ID },
        { ...CONDITIONS, topicIds: ['topic-b', 'topic-a'] },
      );

      // when
      const position = decodeLibraryCursor(cursor, {
        ...CONDITIONS,
        topicIds: ['topic-a', 'topic-b'],
      });

      // then
      expect(position.id).toBe(ITEM_ID);
    });

    it('형식이 깨진 커서는 거절한다', () => {
      // given

      // when
      const error = catchError(() =>
        decodeLibraryCursor('not-a-cursor', CONDITIONS),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.LIBRARY_CURSOR_INVALID);
    });
  });
});
