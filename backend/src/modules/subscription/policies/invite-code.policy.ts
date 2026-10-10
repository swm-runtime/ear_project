import { randomInt } from 'node:crypto';

import {
  serviceDateStart,
  shiftServiceDate,
  toServiceDate,
} from '@/common/utils/service-date.util';
import { UserTier } from '@/modules/user/user.enum';

/**
 * 초대 코드(domain.md 8.5·8.6)의 순수 규칙 — 정규화·생성·지급 기간·티어 비교.
 */

/** 저장·입력 모두 이 모양이다(정규화 뒤). 사람이 받아 적는 값이라 대문자·숫자·하이픈만 */
export const INVITE_CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;

/** 자동 생성 문자 — 받아 적을 때 헷갈리는 0/O · 1/I/L 을 뺐다 */
const GENERATED_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GENERATED_CODE_LENGTH = 8;

/**
 * 티어의 높낮이 — `users.tier` 캐시를 구독과 지급 중 **높은 쪽**으로 맞출 때 쓴다. 체험은 저장되는 티어가 아니라
 * (`users.trial_ends_at`으로 판정) 무료와 같은 자리다.
 */
const TIER_RANK: Record<UserTier, number> = {
  [UserTier.LIGHT]: 0,
  [UserTier.TRIAL]: 0,
  [UserTier.DAILY]: 1,
  [UserTier.PRO]: 2,
};

export function higherTier(a: UserTier, b: UserTier): UserTier {
  return TIER_RANK[b] > TIER_RANK[a] ? b : a;
}

export function isHigherTier(candidate: UserTier, than: UserTier): boolean {
  return TIER_RANK[candidate] > TIER_RANK[than];
}

/** 입력 정규화 — 앞뒤 공백을 지우고 대문자로. 사용자가 소문자로 쳐도 같은 코드다 */
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** 운영자가 코드를 비워 두었을 때의 자동 생성값(8자, 약 8.5×10^11가지) */
export function generateInviteCode(): string {
  let code = '';
  for (let index = 0; index < GENERATED_CODE_LENGTH; index += 1) {
    code += GENERATED_CODE_ALPHABET[randomInt(GENERATED_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * 지급이 끝나는 시각(배타 경계). **서비스 날짜 경계에 맞춘다** — 한낮에 끝나면 아침에 무제한으로 듣던 사용자가
 * 오후에 한도에 막힌다(가입 체험과 같은 이유 — `signup-trial.util.ts`).
 *
 * - 일수: 입력한 서비스 날짜를 1일째로 센 `days`일째의 다음 경계
 * - 마지막 날: 그 서비스 날짜의 다음 경계
 */
export function resolveInviteGrantEndsAt(
  code: { grantDays: number | null; grantUntilDate: string | null },
  redeemedAt: Date,
): Date {
  if (code.grantDays !== null) {
    return serviceDateStart(
      shiftServiceDate(toServiceDate(redeemedAt), code.grantDays),
    );
  }

  return serviceDateStart(shiftServiceDate(code.grantUntilDate!, 1));
}

/** 지급으로 들을 수 있는 마지막 서비스 날짜(`YYYY-MM-DD`) — 안내 문구의 "N월 N일까지" */
export function toInviteGrantLastDate(endsAt: Date): string {
  return toServiceDate(new Date(endsAt.getTime() - 1));
}
