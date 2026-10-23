import { HttpStatus } from '@nestjs/common';
import { createHash } from 'node:crypto';

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
  HybridSearchCursorPosition,
  PopularCursorPosition,
  SearchCursorPosition,
} from '@/modules/content/content.types';

import { SearchMatch } from './explore.types';

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

/**
 * 하이브리드 검색 커서(KAN-238 — explore-api.md 4.5). 최종 정렬 키 넷(RRF 점수·인기·신선도·id)과, 다음 페이지를 **같은 검색**으로
 * 잇는 데 필요한 것을 담는다 — 실제 검색어(교정어)·교정 여부·첫 페이지의 `match`·의미 엔진을 썼는가.
 *
 * - **지문은 입력 질의 + 주제 필터 + `exact`의 해시다.** 셋 중 하나라도 다르면 `EXPLORE_CURSOR_INVALID`. 해시로 담는 이유: 질의
 *   원문(최대 100자 = UTF-8 300바이트)과 교정어를 둘 다 실으면 커서 길이 상한(512자)을 넘을 수 있다.
 * - 교정어(`u`)는 교정했을 때만 싣는다 — 아니면 실제 검색어 = 입력 질의다.
 * - `s`(의미 엔진 사용)가 거짓이면 다음 페이지도 의미 엔진을 돌리지 않는다 — 첫 페이지가 키워드만으로 줄 세워졌는데 다음
 *   페이지에서 AI 서버가 살아나 의미 결과가 섞이면 RRF 척도가 달라져 경계가 어긋난다. 반대(첫 페이지는 썼는데 지금 결손)는
 *   피할 수 없고, 미세한 순서 흔들림으로 감수한다(문서 명시).
 *
 * `v: 2`로 종전(키워드 전용) 커서와 가른다. 종전 커서(1.3.0까지의 앱이 배포 순간 들고 있던 것)는 `decodeAnySearchCursor`가
 * **종전 키워드 경로로 이어 준다** — 오류를 내지 않는다.
 *
 * `v: 3`은 **키워드 순서** 하이브리드 커서다(KAN-242) — 질의 벡터 없이 시작한 검색은 종전 키워드 검색 그대로 줄 세우므로 RRF 점수
 * 대신 종전 키워드 정렬 키(가중 합 `k`·제목 유사도 `w`)를 담는다. 그런 검색만 이 커서를 받으므로 `s`는 언제나 거짓이다(참이면
 * 거절 — 척도가 다른 두 정렬을 섞지 않는다). 버전이 달라 RRF 커서와 섞여 해석되지 않는다.
 */
interface HybridSearchCursorPayloadBase {
  /** 직전 확정 월 재생 수 */
  p: number;
  /** `published_at` (ISO 8601) */
  t: string;
  i: string;
  /** 지문 해시 — 입력 질의 + 주제 필터 + exact */
  q: string;
  /** 교정어 — 교정했을 때만 */
  u?: string;
  /** 첫 페이지의 `match` */
  m: SearchMatch;
  /** 첫 페이지가 의미 엔진을 썼는가 */
  s: boolean;
}

/** RRF 순서 */
interface RrfHybridSearchCursorPayload extends HybridSearchCursorPayloadBase {
  v: 2;
  /** RRF 점수(double precision) */
  r: number;
}

/** 키워드 순서(KAN-242) — 의미 엔진 없이 시작한 검색 */
interface KeywordHybridSearchCursorPayload extends HybridSearchCursorPayloadBase {
  v: 3;
  /** 매칭 필드 가중 합 */
  k: number;
  /** 제목 `word_similarity` (double precision) */
  w: number;
  s: false;
}

type HybridSearchCursorPayload =
  RrfHybridSearchCursorPayload | KeywordHybridSearchCursorPayload;

/** 다음 페이지를 같은 검색으로 잇는 값 — 커서가 싣는 검색 상태 */
export interface HybridSearchState {
  /** 실제 검색어 — 교정어 또는 입력 질의 */
  queryUsed: string;
  /** 교정했는가 — 그러면 `corrected_from` = 입력 질의 */
  corrected: boolean;
  match: SearchMatch;
  semantic: boolean;
}

export type DecodedSearchCursor =
  | { kind: 'legacy'; position: SearchCursorPosition }
  | {
      kind: 'hybrid';
      position: HybridSearchCursorPosition;
      state: HybridSearchState;
    };

function hybridFingerprint(
  normalizedQuery: string,
  topicIds: string[],
  exact: boolean,
): string {
  return createHash('sha256')
    .update(
      `${normalizedQuery}\u0000${[...topicIds].sort().join(',')}\u0000${exact ? 'exact' : ''}`,
    )
    .digest('base64url')
    .slice(0, 22);
}

export function encodeHybridSearchCursor(
  position: HybridSearchCursorPosition,
  state: HybridSearchState,
  normalizedQuery: string,
  topicIds: string[],
  exact: boolean,
): string {
  const base = {
    p: position.playCount,
    t: position.publishedAt.toISOString(),
    i: position.id,
    q: hybridFingerprint(normalizedQuery, topicIds, exact),
    ...(state.corrected && { u: state.queryUsed }),
    m: state.match,
  };
  let payload: HybridSearchCursorPayload;

  if (position.order === 'rrf') {
    payload = { v: 2, r: position.rrf, ...base, s: state.semantic };
  } else {
    // 키워드 순서는 의미 엔진 없이 시작한 검색에서만 나온다 — 발급부터 그 불변식을 지킨다
    if (state.semantic) {
      throw new Error('keyword-order hybrid cursor must not use semantic');
    }
    payload = {
      v: 3,
      k: position.score,
      w: position.titleSimilarity,
      ...base,
      s: false,
    };
  }

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * 검색 커서 해석 — 하이브리드(`v: 2`)면 그 위치와 검색 상태, **종전 키워드 커서면 `legacy`**(호출부가 종전 키워드 경로로
 * 잇는다 — 배포 순간 옛 앱이 들고 있던 커서가 오류 없이 다음 페이지를 받는다. 종전 커서는 `exact`를 모르므로 `exact`와
 * 무관하게 받는다 — 교정 없는 키워드 검색이 곧 `exact` 키워드 모드다).
 *
 * 하이브리드 커서는 발급 시점과 `query`·`topic_ids`·`exact`가 하나라도 다르면 거절한다.
 */
export function decodeAnySearchCursor(
  cursor: string,
  normalizedQuery: string,
  topicIds: string[],
  exact: boolean,
): DecodedSearchCursor {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  if (
    typeof decoded === 'object' &&
    decoded !== null &&
    (decoded as Record<string, unknown>).v === undefined
  ) {
    return {
      kind: 'legacy',
      position: decodeSearchCursor(cursor, normalizedQuery, topicIds),
    };
  }

  if (
    !isHybridSearchCursorPayload(decoded) ||
    decoded.q !== hybridFingerprint(normalizedQuery, topicIds, exact)
  ) {
    throw invalidCursor();
  }

  const publishedAt = new Date(decoded.t);

  if (Number.isNaN(publishedAt.getTime())) {
    throw invalidCursor();
  }

  return {
    kind: 'hybrid',
    position:
      decoded.v === 2
        ? {
            order: 'rrf',
            rrf: decoded.r,
            playCount: decoded.p,
            publishedAt,
            id: decoded.i,
          }
        : {
            order: 'keyword',
            score: decoded.k,
            titleSimilarity: decoded.w,
            playCount: decoded.p,
            publishedAt,
            id: decoded.i,
          },
    state: {
      queryUsed: decoded.u ?? normalizedQuery,
      corrected: decoded.u !== undefined,
      match: decoded.m,
      semantic: decoded.s,
    },
  };
}

function isHybridSearchCursorPayload(
  value: unknown,
): value is HybridSearchCursorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const orderKeys =
    candidate.v === 2
      ? // RRF 점수는 두 엔진 합이라 0 초과 2/(k+1) 이하다 — 범위만 막는다(SQL에 들어가는 값이다)
        typeof candidate.r === 'number' &&
        Number.isFinite(candidate.r) &&
        candidate.r > 0 &&
        candidate.r <= 1 &&
        typeof candidate.s === 'boolean'
      : candidate.v === 3 &&
        // 종전 키워드 커서와 같은 정의역 — 가중 합(정수)·제목 유사도(0~1). 의미 엔진을 쓴 검색의 커서가 아니다
        isCountValue(candidate.k) &&
        isRatioValue(candidate.w) &&
        candidate.s === false;

  return (
    orderKeys &&
    isCountValue(candidate.p) &&
    isTimestampValue(candidate.t) &&
    isUuid(candidate.i) &&
    typeof candidate.q === 'string' &&
    (candidate.u === undefined ||
      (typeof candidate.u === 'string' && candidate.u.length > 0)) &&
    (candidate.m === 'keyword' || candidate.m === 'related')
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

/** 사용자에게 노출하지 않는다 — 클라이언트가 커서를 버리고 조용히 재조회한다 */
function invalidCursor(): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.EXPLORE_CURSOR_INVALID,
    message: '목록을 다시 불러올게요',
    logLevel: 'info',
  });
}
