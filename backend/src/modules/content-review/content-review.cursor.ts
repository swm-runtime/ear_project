import { HttpStatus } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { isUuid } from '@/common/utils/cursor-value.util';

import {
  AdminContentReviewCursorPosition,
  AdminContentReviewListFilter,
} from './content-review.types';

/**
 * 관리자 글 목록(`content-review-api.md` 4.9)의 커서 — 불투명 base64url JSON. 관리자 전용이라 서명하지 않는다.
 * **발급 때와 다른 필터로 이어 받으면 거절한다**(400 `VALIDATION_FAILED`) — 두 조건이 섞인 목록이 된다.
 */
interface CursorPayload {
  /** `updated_at` — 마이크로초까지 담은 UTC ISO 문자열 */
  u: string;
  /** tie-break `id` */
  i: string;
  /** 필터 지문 */
  q: string;
}

/** `2026-10-28T23:10:00.123456Z` — Repository 가 `to_char`로 만드는 모양 그대로만 받는다 */
const EXACT_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function fingerprint(filter: AdminContentReviewListFilter): string {
  return [
    filter.contentId ?? '-',
    filter.market ?? '-',
    filter.hasText === null ? '-' : String(filter.hasText),
  ].join('|');
}

export function encodeContentReviewCursor(
  position: AdminContentReviewCursorPosition,
  filter: AdminContentReviewListFilter,
): string {
  const payload: CursorPayload = {
    u: position.updatedAt,
    i: position.id,
    q: fingerprint(filter),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeContentReviewCursor(
  cursor: string,
  filter: AdminContentReviewListFilter,
): AdminContentReviewCursorPosition {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw invalidCursor();
  }

  const payload = decoded as Record<string, unknown>;

  // 값의 정의역까지 본다 — 형식이 깨진 값이 SQL 비교식에 닿으면 500 이 된다(`cursor-value.util.ts`)
  if (
    typeof payload.u !== 'string' ||
    !EXACT_TIMESTAMP_PATTERN.test(payload.u) ||
    Number.isNaN(new Date(payload.u).getTime()) ||
    !isUuid(payload.i) ||
    payload.q !== fingerprint(filter)
  ) {
    throw invalidCursor();
  }

  return { updatedAt: payload.u, id: payload.i };
}

function invalidCursor(): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.VALIDATION_FAILED,
    message: '목록 위치를 해석할 수 없어요. 처음부터 다시 조회해주세요',
    logLevel: 'info',
  });
}
