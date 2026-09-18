import { HttpStatus } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { isTimestampValue, isUuid } from '@/common/utils/cursor-value.util';

import {
  AdminNoticeCursorPosition,
  PublishedNoticeCursorPosition,
} from './notice.types';

/**
 * 공지 목록 커서 — **불투명 base64url JSON이다.** 클라이언트는 저장·재전송만 한다.
 *
 * 서명하지 않는 이유는 `library-screen.cursor.ts`와 같다 — 공지는 모든 사용자에게 같은 목록이라
 * 위조해도 볼 수 있는 것 이상은 나오지 않는다. 대신 **값의 정의역은 검증한다**(`cursor-value.util.ts` —
 * 형식이 틀린 값이 SQL 비교식에 닿으면 500이 된다).
 *
 * 사용자 목록과 관리자 목록은 정렬이 달라 페이로드가 다르다. 한쪽 커서를 다른 쪽에 넣으면 거절한다.
 */
interface PublishedPayload {
  /** 목록 종류 — 관리자 커서와 섞이지 않게 한다 */
  k: 'p';
  p: boolean;
  t: string;
  i: string;
}

interface AdminPayload {
  k: 'a';
  c: string;
  i: string;
}

export function encodePublishedNoticeCursor(
  position: PublishedNoticeCursorPosition,
): string {
  return encode({
    k: 'p',
    p: position.isPinned,
    t: position.publishedAt.toISOString(),
    i: position.id,
  } satisfies PublishedPayload);
}

export function decodePublishedNoticeCursor(
  cursor: string,
): PublishedNoticeCursorPosition {
  const payload = parse(cursor);

  if (
    payload.k !== 'p' ||
    typeof payload.p !== 'boolean' ||
    !isTimestampValue(payload.t) ||
    !isUuid(payload.i)
  ) {
    throw invalidCursor();
  }

  return {
    isPinned: payload.p,
    publishedAt: new Date(payload.t),
    id: payload.i,
  };
}

export function encodeAdminNoticeCursor(
  position: AdminNoticeCursorPosition,
): string {
  return encode({
    k: 'a',
    c: position.createdAt.toISOString(),
    i: position.id,
  } satisfies AdminPayload);
}

export function decodeAdminNoticeCursor(
  cursor: string,
): AdminNoticeCursorPosition {
  const payload = parse(cursor);

  if (payload.k !== 'a' || !isTimestampValue(payload.c) || !isUuid(payload.i)) {
    throw invalidCursor();
  }

  return { createdAt: new Date(payload.c), id: payload.i };
}

function encode(payload: PublishedPayload | AdminPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function parse(cursor: string): Record<string, unknown> {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw invalidCursor();
  }

  return decoded as Record<string, unknown>;
}

/** 사용자에게 노출하지 않는다 — 클라이언트가 커서를 버리고 첫 페이지부터 다시 조회한다 */
function invalidCursor(): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.NOTICE_CURSOR_INVALID,
    message: '목록을 다시 불러올게요',
    logLevel: 'info',
  });
}
