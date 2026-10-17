import { HttpStatus } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  isCountValue,
  isRatioValue,
  isTimestampValue,
  isUuid,
} from '@/common/utils/cursor-value.util';
import { StatsPeriodType } from '@/modules/content/content.enum';
import {
  ExploreCursorPosition,
  PopularCursorPosition,
  SearchCursorPosition,
} from '@/modules/content/content.types';

/**
 * 커서는 **API 계약이지 도메인 개념이 아니다.** 그래서 Repository가 아니라 이 모듈이
 * 소유하고, `content` 모듈에는 해석된 위치(`ExploreCursorPosition`)만 넘긴다
 * (라이브러리 커서와 같은 구조).
 */
interface CursorPayload {
  /** 랭킹 1순위 — 전체 구간 재생 수 */
  p: number;
  /** `published_at` (ISO 8601) */
  t: string;
  /** tie-break용 `id` */
  i: string;
  /** 발급 시점의 조회 조건 지문 */
  q: string;
}

/**
 * 조회 조건 지문. **주제 목록은 정렬해서 담는다** — 같은 조건을 다른 순서로 보냈다고 커서가
 * 무효가 되면 클라이언트가 조건을 정렬해 보내야 한다는 숨은 규칙이 생긴다.
 */
function fingerprint(topicIds: string[]): string {
  return [...topicIds].sort().join(',');
}

/**
 * **불투명 문자열이다.** 클라이언트는 저장·재전송만 하고 해석하지 않는다.
 *
 * 서명하지 않는 이유는 라이브러리와 같다 — 위조해도 자기 데이터만 조회된다.
 * **커서에 `user_id`를 담지 않는다**(explore-api.md 7장). 담으면 남의 커서를 넣어 조회를
 * 시도할 여지가 생기며, 스코프는 언제나 토큰이 정한다.
 */
export function encodeExploreCursor(
  position: ExploreCursorPosition,
  topicIds: string[],
): string {
  const payload: CursorPayload = {
    p: position.playCount,
    t: position.publishedAt.toISOString(),
    i: position.id,
    q: fingerprint(topicIds),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * **발급 시점과 다른 `topic_ids`면 거절한다**(explore-api.md 4.2).
 * 조건이 바뀐 커서를 이어 쓰면 두 조건이 섞인 목록이 만들어진다.
 * 클라이언트는 커서를 버리고 첫 페이지부터 다시 조회한다.
 */
export function decodeExploreCursor(
  cursor: string,
  topicIds: string[],
): ExploreCursorPosition {
  const payload = parse(cursor);

  if (payload.q !== fingerprint(topicIds)) {
    throw invalidCursor();
  }

  const publishedAt = new Date(payload.t);

  if (Number.isNaN(publishedAt.getTime())) {
    throw invalidCursor();
  }

  return { playCount: payload.p, publishedAt, id: payload.i };
}

/**
 * 인기 목록 커서(explore-api.md 4.2-1). 정렬 키가 하나 더 많아 payload도 그만큼 담는다.
 *
 * **지문은 `period`다.** 구간이 바뀐 커서를 이어 쓰면 두 구간이 섞인 목록이 된다 —
 * 주제 필터 목록이 `topic_ids`를 지문으로 쓰는 것과 같은 이유다.
 */
interface PopularCursorPayload {
  /** 그 구간의 재생 수 */
  p: number;
  /** 그 구간의 완청 수 */
  c: number;
  /** `published_at` (ISO 8601) */
  t: string;
  /** tie-break용 `id` */
  i: string;
  /** 발급 시점의 집계 구간 */
  q: string;
}

/**
 * 인기 목록의 조회 조건 지문은 **구간 하나**다. 주제 필터 목록이 `topic_ids`를 지문으로 쓰는
 * 것과 같은 자리이며, 지문을 문자열로 통일해 두 커서가 같은 판정 구조를 갖는다.
 */
function popularFingerprint(period: StatsPeriodType): string {
  return period;
}

export function encodePopularCursor(
  position: PopularCursorPosition,
  period: StatsPeriodType,
): string {
  const payload: PopularCursorPayload = {
    p: position.playCount,
    c: position.completeCount,
    t: position.publishedAt.toISOString(),
    i: position.id,
    q: popularFingerprint(period),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** **발급 시점과 다른 `period`면 거절한다.** 클라이언트는 첫 페이지부터 다시 조회한다 */
export function decodePopularCursor(
  cursor: string,
  period: StatsPeriodType,
): PopularCursorPosition {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  if (
    !isPopularCursorPayload(decoded) ||
    decoded.q !== popularFingerprint(period)
  ) {
    throw invalidCursor();
  }

  const publishedAt = new Date(decoded.t);

  if (Number.isNaN(publishedAt.getTime())) {
    throw invalidCursor();
  }

  return {
    playCount: decoded.p,
    completeCount: decoded.c,
    publishedAt,
    id: decoded.i,
  };
}

function isPopularCursorPayload(value: unknown): value is PopularCursorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    isCountValue(candidate.p) &&
    isCountValue(candidate.c) &&
    isTimestampValue(candidate.t) &&
    isUuid(candidate.i) &&
    typeof candidate.q === 'string'
  );
}

/**
 * 검색 커서(explore-api.md 4.5). 정렬 키 다섯을 전부 담는다 — 매칭 점수·제목 유사도·인기·
 * 신선도·id(`explore.md` 4.5-5의 우선순위와 동점 해소 체인 그대로).
 *
 * **지문은 정규화된 질의 + 주제 필터다.** 발급 시점과 다른 `query`·`topic_ids`면 거절한다
 * (explore-api.md 4.5 — 두 조건이 섞인 목록을 만들지 않는다). 질의를 정규화 후 값으로
 * 대조하므로, 같은 검색어를 NFD로 다시 보내도 커서는 유효하다.
 */
interface SearchCursorPayload {
  /** 매칭 필드 가중 합 */
  s: number;
  /** 제목 `word_similarity` (double precision) */
  w: number;
  /** 직전 확정 월 재생 수 */
  p: number;
  /** `published_at` (ISO 8601) */
  t: string;
  /** tie-break용 `id` */
  i: string;
  /** 발급 시점의 조회 조건 지문 */
  q: string;
}

function searchFingerprint(
  normalizedQuery: string,
  topicIds: string[],
): string {
  return `${normalizedQuery}|${[...topicIds].sort().join(',')}`;
}

export function encodeSearchCursor(
  position: SearchCursorPosition,
  normalizedQuery: string,
  topicIds: string[],
): string {
  const payload: SearchCursorPayload = {
    s: position.score,
    w: position.titleSimilarity,
    p: position.playCount,
    t: position.publishedAt.toISOString(),
    i: position.id,
    q: searchFingerprint(normalizedQuery, topicIds),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** **발급 시점과 다른 `query`·`topic_ids`면 거절한다.** 클라이언트는 첫 페이지부터 다시 조회한다 */
export function decodeSearchCursor(
  cursor: string,
  normalizedQuery: string,
  topicIds: string[],
): SearchCursorPosition {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  if (
    !isSearchCursorPayload(decoded) ||
    decoded.q !== searchFingerprint(normalizedQuery, topicIds)
  ) {
    throw invalidCursor();
  }

  const publishedAt = new Date(decoded.t);

  if (Number.isNaN(publishedAt.getTime())) {
    throw invalidCursor();
  }

  return {
    score: decoded.s,
    titleSimilarity: decoded.w,
    playCount: decoded.p,
    publishedAt,
    id: decoded.i,
  };
}

function isSearchCursorPayload(value: unknown): value is SearchCursorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    // `s`는 매칭 필드 가중 합(정수), `w`는 제목 유사도(0~1)다 — 정의역이 다르다
    isCountValue(candidate.s) &&
    isRatioValue(candidate.w) &&
    isCountValue(candidate.p) &&
    isTimestampValue(candidate.t) &&
    isUuid(candidate.i) &&
    typeof candidate.q === 'string'
  );
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
    isCountValue(candidate.p) &&
    isTimestampValue(candidate.t) &&
    isUuid(candidate.i) &&
    typeof candidate.q === 'string'
  );
}

/**
 * 시리즈 카드 모드(KAN-134 확정 설계 4번 — `SERIES_EXPLORE_CARDS_ENABLED`)의 **이미 낸 시리즈** 목록을 커서에 덧붙인다(`g`).
 * 카드는 그 시리즈 편 중 순위가 가장 높은 편의 자리에 한 번만 나오고, 뒤 페이지의 같은 시리즈 편은 건너뛴다 — 그 판정을 서버
 * 상태 없이 하려면 앞 페이지까지 낸 시리즈를 커서가 들고 다녀야 한다. 정렬해 담아 같은 입력이면 같은 커서다.
 *
 * **스위치가 꺼져 있으면 부르지 않는다** — 커서가 이 기능 전과 바이트 단위로 같다.
 */
export function attachSeenSeries(cursor: string, seriesIds: string[]): string {
  const payload = JSON.parse(
    Buffer.from(cursor, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;

  return Buffer.from(
    JSON.stringify({ ...payload, g: [...seriesIds].sort() }),
    'utf8',
  ).toString('base64url');
}

/**
 * 커서의 이미 낸 시리즈(`g`). 없으면(스위치가 꺼져 있을 때 발급된 커서) 빈 목록 — 그 경우 앞 페이지에서 편으로 나온 시리즈가
 * 카드로 한 번 더 나올 수 있지만 전환 순간 한 번뿐이다. uuid가 아닌 값이 섞이면 위조로 보고 거절한다.
 * 정렬 키·지문 검증은 각 `decode*Cursor`가 먼저 끝낸 뒤 부른다.
 */
export function readSeenSeries(cursor: string): string[] {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  const seen = (decoded as { g?: unknown } | null)?.g;

  if (seen === undefined) {
    return [];
  }
  if (!Array.isArray(seen) || !seen.every((value) => isUuid(value))) {
    throw invalidCursor();
  }

  return seen;
}

/** 사용자에게 노출하지 않는다 — 클라이언트가 커서를 버리고 조용히 재조회한다 */
function invalidCursor(): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.EXPLORE_CURSOR_INVALID,
    message: '목록을 다시 불러올게요',
    logLevel: 'info',
  });
}
