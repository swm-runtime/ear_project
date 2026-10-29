import {
  serviceDateStart,
  shiftServiceDate,
  shiftWeekStart,
  toCurrentWeekStart,
  toServiceDate,
} from '@/common/utils/service-date.util';

import {
  CONTENT_REVIEW_PROMPT_INTERVAL_DAYS,
  CONTENT_REVIEW_PROMPT_RECENT_DAYS,
} from '../content-review.constant';
import { ContentReviewUnreviewableReason } from '../content-review.enum';

/**
 * 콘텐츠 후기(`content-review.md` · `content-review-api.md`)의 순수 규칙 — 글 정규화 · 쓸 수 있는 편 판정 · 먼저 묻기 관문.
 * 날짜는 전부 서비스 날짜 라벨(`YYYY-MM-DD`, 05:00 KST 경계)로 다룬다 — 문자열 순서가 곧 날짜 순서다.
 */

/** 글 길이 — **코드 포인트** 수(4.2). `String.length`는 UTF-16 단위라 이모지 하나를 2자로 센다 */
export function codePointLength(text: string): number {
  return [...text].length;
}

/**
 * 저장할 글 — 앞뒤 공백(유니코드 공백 전부 — `String.prototype.trim`)을 뺀다. 빈 값 · `null` · 생략은 **글 없음**(`null`)이다
 * (빈 문자열은 저장하지도 응답하지도 않는다 — domain.md 6.8).
 */
export function normalizeReviewText(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const trimmed = raw.trim();

  return trimmed.length === 0 ? null : trimmed;
}

/**
 * 지금 저장할 수 없는 사유 — 없으면 `null`. 순서가 곧 우선순위다(4.1 `reason` · 4.2 에러 순서):
 * 스위치 꺼짐 → 회수 · 만료 → 재생 시작 안 함.
 */
export function resolveUnreviewableReason(state: {
  enabled: boolean;
  visible: boolean;
  played: boolean;
}): ContentReviewUnreviewableReason | null {
  if (!state.enabled) {
    return ContentReviewUnreviewableReason.DISABLED;
  }
  if (!state.visible) {
    return ContentReviewUnreviewableReason.WITHDRAWN;
  }
  if (!state.played) {
    return ContentReviewUnreviewableReason.NOT_PLAYED;
  }

  return null;
}

/** 먼저 묻기를 편 조회 전에 막는 관문(4.3 판정 2 · 3). 스위치(판정 1)는 호출자가 먼저 본다 */
export type ContentReviewPromptGate =
  { open: true } | { open: false; mutedUntil: string | null };

export function resolvePromptGate(state: {
  today: string;
  mutedUntil: string | null;
  lastPromptedDate: string | null;
}): ContentReviewPromptGate {
  // 2. 그만 보기 중 — 오늘 < 종료 라벨(다음 주 월요일)
  if (state.mutedUntil !== null && state.today < state.mutedUntil) {
    return { open: false, mutedUntil: state.mutedUntil };
  }

  // 3. 마지막으로 물은 날 + 5 서비스 날짜가 아직 안 됨 — 오늘 ≥ 물은 날 + 5 여야 다시 묻는다
  if (
    state.lastPromptedDate !== null &&
    state.today <
      shiftServiceDate(
        state.lastPromptedDate,
        CONTENT_REVIEW_PROMPT_INTERVAL_DAYS,
      )
  ) {
    return { open: false, mutedUntil: null };
  }

  return { open: true };
}

/**
 * 먼저 묻는 편을 찾는 창의 시작 시각 — **최근 14 서비스 날짜(오늘 포함)**의 첫날 05:00 KST(4.3-4).
 * 이 시각 이후에 끝까지 들은 편만 묻는다.
 */
export function promptCompletedSince(now: Date): Date {
  return serviceDateStart(
    shiftServiceDate(
      toServiceDate(now),
      -(CONTENT_REVIEW_PROMPT_RECENT_DAYS - 1),
    ),
  );
}

/**
 * "물었다"로 적을 날짜 — 오늘 서비스 날짜. **뒤로 가지 않는다**(4.4) — 이미 더 늦은 날을 적었으면(기기 시각과 무관하게
 * 일어나지 않지만 재전송 순서가 뒤바뀌어도) 그대로 둔다. 바꿀 것이 없으면 `null`.
 */
export function nextLastPromptedDate(
  current: string | null,
  today: string,
): string | null {
  return current !== null && current >= today ? null : today;
}

/** [이번 주 그만 보기]의 종료 라벨 — 다음 서비스 주 월요일(주 경계 월 05:00 KST, 4.5) */
export function resolveMutedUntil(now: Date): string {
  return shiftWeekStart(toCurrentWeekStart(now), 1);
}
