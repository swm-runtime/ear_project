import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { HttpStatus } from '@nestjs/common';

import {
  LibraryItemFilter,
  LibraryItemSort,
} from '@/modules/library/library.enum';
import { LibraryCursorPosition } from '@/modules/library/library.types';

/**
 * 커서는 **API 계약이지 도메인 개념이 아니다.** 그래서 Repository가 아니라 이 모듈이
 * 소유하고, `library` 모듈에는 해석된 위치(`LibraryCursorPosition`)만 넘긴다.
 *
 * **offset이 아니라 keyset을 쓴다.** 드립이 적립되면 목록 앞쪽이 계속 밀리므로 offset은
 * 중복·누락을 만든다(convention.md 5.3).
 */
interface CursorPayload {
  /** `added_at` (ISO 8601) */
  a: string;
  /** tie-break용 `id` — 같은 배치로 적립된 드립은 `added_at`이 동일할 수 있다 */
  i: string;
  /** 발급 시점의 조회 조건 지문 */
  q: string;
}

export interface CursorConditions {
  filter: LibraryItemFilter;
  sort: LibraryItemSort;
  topicIds: string[];
}

/**
 * 조회 조건 지문. **주제 목록은 정렬해서 담는다** — 같은 조건을 다른 순서로 보냈다고
 * 커서가 무효가 되면 클라이언트가 조건을 정렬해 보내야 한다는 숨은 규칙이 생긴다.
 */
function fingerprint(conditions: CursorConditions): string {
  return [
    conditions.filter,
    conditions.sort,
    [...conditions.topicIds].sort().join(','),
  ].join('|');
}

/**
 * **불투명 문자열이다.** 클라이언트는 저장·재전송만 하고 해석하지 않는다.
 *
 * 서명하지 않는 이유: 위조해도 자기 데이터만 조회된다 — **스코프는 언제나 토큰이 정하고
 * 커서에 `user_id`를 담지 않는다**(library-api.md 7장). 담으면 남의 커서를 넣어 조회를
 * 시도할 여지가 생긴다.
 */
export function encodeLibraryCursor(
  position: LibraryCursorPosition,
  conditions: CursorConditions,
): string {
  const payload: CursorPayload = {
    a: position.addedAt.toISOString(),
    i: position.id,
    q: fingerprint(conditions),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * **발급 시점과 다른 `filter`·`sort`·`topic_filter`면 거절한다.** 조건이 바뀐 커서를 이어
 * 쓰면 두 조건이 섞인 목록이 만들어진다. 클라이언트는 첫 페이지부터 다시 조회한다.
 */
export function decodeLibraryCursor(
  cursor: string,
  conditions: CursorConditions,
): LibraryCursorPosition {
  const payload = parse(cursor);

  if (payload.q !== fingerprint(conditions)) {
    throw invalidCursor();
  }

  const addedAt = new Date(payload.a);

  if (Number.isNaN(addedAt.getTime())) {
    throw invalidCursor();
  }

  return { addedAt, id: payload.i };
}

function parse(cursor: string): CursorPayload {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  if (!isCursorPayload(decoded)) {
    throw invalidCursor();
  }

  return decoded;
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.a === 'string' &&
    typeof candidate.i === 'string' &&
    typeof candidate.q === 'string'
  );
}

/** 사용자에게 노출하지 않는다 — 클라이언트가 커서를 버리고 조용히 재조회한다 */
function invalidCursor(): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.LIBRARY_CURSOR_INVALID,
    message: '목록을 다시 불러올게요',
    logLevel: 'info',
  });
}
