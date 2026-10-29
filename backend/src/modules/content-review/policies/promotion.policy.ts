import {
  serviceDateStart,
  toServiceDate,
} from '@/common/utils/service-date.util';

import {
  CONTENT_REVIEW_REWARD_MIN_TEXT,
  CONTENT_REVIEW_REWARD_REQUIRED,
  CONTENT_REVIEW_REWARD_VALID_MONTHS,
} from '../content-review.constant';
import { RewardProgressView } from '../content-review.types';

/**
 * 후기 참여 프로모션(`content-review.md` 4.4 · domain.md 8.7)의 순수 규칙 — 보상으로 치는 후기 · 진행 · 사용 기한.
 */

/** 유니코드 공백 전부(`\s`는 `u` 플래그에서 NBSP · 전각 공백 · 줄 구분자까지 포함한다) */
const WHITESPACE = /\s/gu;

/**
 * **보상으로 치는 후기** — 저장 시점에 끝까지 들은 편이고, 글의 공백을 뺀 글자 수(코드 포인트)가 10 이상(4.4).
 * 별점은 늘 있으므로 따로 보지 않는다.
 */
export function isRewardEligibleReview(review: {
  isCompleted: boolean;
  text: string | null;
}): boolean {
  if (!review.isCompleted || review.text === null) {
    return false;
  }

  return (
    [...review.text.replace(WHITESPACE, '')].length >=
    CONTENT_REVIEW_REWARD_MIN_TEXT
  );
}

/** 발급까지의 진행 — `required`를 넘지 않게 자른다(2.2) */
export function toRewardProgress(eligibleCount: number): RewardProgressView {
  return {
    current: Math.min(eligibleCount, CONTENT_REVIEW_REWARD_REQUIRED),
    required: CONTENT_REVIEW_REWARD_REQUIRED,
  };
}

/** 이 저장으로 발급할 만큼 찼는가 — 서로 다른 편 수(후기는 `(user, content)`당 한 행이라 행 수가 곧 편 수다) */
export function hasReachedReward(eligibleCount: number): boolean {
  return eligibleCount >= CONTENT_REVIEW_REWARD_REQUIRED;
}

/**
 * 소멸 시각(배타 경계) — 발급한 **서비스 날짜**의 3개월 뒤 같은 날짜의 서비스 날짜 시작(05:00 KST). 그 달에 같은 날짜가
 * 없으면 그 달 마지막 날이다(domain.md 8.7). 예: 10-28 발급 → 2027-01-28 05:00 · 11-30 → 2027-02-28 05:00.
 */
export function resolvePromotionExpiresAt(issuedAt: Date): Date {
  const [year, month, day] = toServiceDate(issuedAt).split('-').map(Number);
  const targetMonthIndex = month - 1 + CONTENT_REVIEW_REWARD_VALID_MONTHS;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  // 다음 달 0일 = 이번 달 말일
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const label = [
    targetYear,
    String(targetMonth).padStart(2, '0'),
    String(Math.min(day, lastDay)).padStart(2, '0'),
  ].join('-');

  return serviceDateStart(label);
}

/** 쓸 수 있는 마지막 서비스 날짜 — 소멸 시각 직전이 속한 서비스 날짜("{N월 N일}까지 사용") */
export function toPromotionLastUsableDate(expiresAt: Date): string {
  return toServiceDate(new Date(expiresAt.getTime() - 1));
}

/** 지금 소멸했는가 — 배치 없이 조회 · 사용 시점에 판정한다 */
export function isPromotionExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
