import {
  buildContentDeepLink,
  DEEP_LINK_LIBRARY,
} from '@/modules/notification/notification.constant';
import { MessageLanguage } from '@/modules/user/user.enum';

import {
  RETENTION_LOG_TYPE_PREFIX,
  RETENTION_PUSH_DAILY_WINDOW_HOURS,
  RETENTION_PUSH_WEEKLY_CAP,
  RETENTION_PUSH_WEEKLY_WINDOW_HOURS,
} from './retention-push.constant';
import { RetentionRuleKey } from './retention-push.enum';
import {
  PEERS_LISTENING_MIN_COUNT,
  RESUME_CONTENT_MAX_REMAINING_SEC,
  RESUME_CONTENT_MIN_REMAINING_SEC,
  RETENTION_RULES,
  STREAK_KEEP_MIN_DAYS,
  WEEKLY_RANK_GAP_MAX_SEC,
  WEEKLY_RANK_GAP_MIN_LISTENERS,
  WEEKLY_RANK_GAP_TARGET_PERCENTS,
} from './retention-push.rules';
import {
  RetentionCandidate,
  RetentionCopy,
  RetentionMarketFacts,
  RetentionPushPlan,
  RetentionRuleDefinition,
  RetentionSentRecord,
  RetentionUserFacts,
} from './retention-push.types';

const HOUR_MS = 60 * 60 * 1000;

/**
 * 이번 주 상위 `percent`%까지 남은 시간. 프로필 `listening_top_percent`와 **같은 공식**이다
 * (`profile.stats.ts` `calculateListeningTopPercent` — 순위 = 1 + 나보다 많이 들은 사람 수, 상위 % = ceil(순위 / 모집단 × 100)).
 * 알림을 보고 들은 뒤 프로필을 열면 그 숫자가 그대로 보여야 한다.
 *
 * 상위 p% ⇔ 순위 ≤ floor(p × 모집단 / 100) = R ⇔ 나보다 많이 들은 사람 ≤ R − 1 ⇔ 내 합 ≥ (나를 뺀) R번째로 많이 들은 사람의 합.
 * 동점은 "나보다 많이"가 아니므로 같아지기만 하면 된다.
 *
 * @param othersDesc 나를 뺀 이번 주 청취자들의 합(초), 큰 순
 * @returns 목표에 이미 들었거나 기준이 0초(아무도 안 들은 자리)면 null
 */
export function secondsToTopPercent(
  mineSec: number,
  othersDesc: readonly number[],
  population: number,
  percent: number,
): number | null {
  const rank = Math.floor((percent * population) / 100);

  if (rank < 1) {
    return null;
  }

  const threshold = othersDesc[rank - 1] ?? 0;
  const gap = threshold - mineSec;

  return threshold > 0 && gap > 0 ? gap : null;
}

/** 시장 집계에서 나를 뺀다 — 내 합과 같은 값 하나만(동점자가 있어도 한 칸) */
function excludeSelf(desc: readonly number[], mineSec: number): number[] {
  if (mineSec <= 0) {
    return [...desc];
  }

  const index = desc.indexOf(mineSec);

  return index < 0
    ? [...desc]
    : [...desc.slice(0, index), ...desc.slice(index + 1)];
}

/**
 * 사용자에게 성립하는 규칙들 — 규칙 표 순서 그대로. 꺼진 규칙·최소 인원 미달·조건 불충족은 빠진다.
 * 오늘 이미 들은 사용자에게는 순위·듣던 콘텐츠만 성립한다 — "연속 기록"·"지금 듣는 사람"은 들으러 오라는 말이라
 * 이미 들은 날엔 맞지 않다.
 */
export function evaluateCandidates(
  user: RetentionUserFacts,
  market: RetentionMarketFacts,
  rules: readonly RetentionRuleDefinition[] = RETENTION_RULES,
): RetentionCandidate[] {
  const candidates: RetentionCandidate[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    const candidate = evaluateRule(rule.key, user, market);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function evaluateRule(
  key: RetentionRuleKey,
  user: RetentionUserFacts,
  market: RetentionMarketFacts,
): RetentionCandidate | null {
  switch (key) {
    case RetentionRuleKey.WEEKLY_RANK_GAP: {
      const others = excludeSelf(market.weekListenedDesc, user.weekListenedSec);

      if (others.length < WEEKLY_RANK_GAP_MIN_LISTENERS) {
        return null;
      }

      for (const percent of WEEKLY_RANK_GAP_TARGET_PERCENTS) {
        const gap = secondsToTopPercent(
          user.weekListenedSec,
          others,
          market.population,
          percent,
        );

        if (gap !== null && gap <= WEEKLY_RANK_GAP_MAX_SEC) {
          return {
            ruleKey: key,
            vars: { gap: Math.max(1, Math.ceil(gap / 60)), percent },
            deepLink: DEEP_LINK_LIBRARY,
          };
        }
      }

      return null;
    }

    case RetentionRuleKey.STREAK_KEEP:
      return !user.listenedRecently && user.streakDays >= STREAK_KEEP_MIN_DAYS
        ? {
            ruleKey: key,
            vars: { days: user.streakDays, next: user.streakDays + 1 },
            deepLink: DEEP_LINK_LIBRARY,
          }
        : null;

    case RetentionRuleKey.RESUME_CONTENT:
      return user.resume &&
        user.resume.remainingSec >= RESUME_CONTENT_MIN_REMAINING_SEC &&
        user.resume.remainingSec <= RESUME_CONTENT_MAX_REMAINING_SEC
        ? {
            ruleKey: key,
            vars: {
              minutes: Math.max(1, Math.ceil(user.resume.remainingSec / 60)),
              title: user.resume.title,
            },
            deepLink: buildContentDeepLink(user.resume.contentId),
          }
        : null;

    case RetentionRuleKey.PEERS_LISTENING: {
      // 나는 "지금 듣는 사람"에 들지 않는다(오늘 안 들은 사람에게만 보낸다) — 뺄 것이 없다
      return !user.listenedRecently &&
        market.listenersNow >= PEERS_LISTENING_MIN_COUNT
        ? {
            ruleKey: key,
            vars: { count: market.listenersNow },
            deepLink: DEEP_LINK_LIBRARY,
          }
        : null;
    }
  }
}

/**
 * 빈도 제한 — 최근 20시간에 1건이라도 보냈거나, 최근 7일에 상한만큼 보냈으면 이번엔 보내지 않는다.
 * 하루를 서비스 날짜가 아니라 시간으로 센다(그룹마다 18:00의 KST 날짜가 달라서).
 */
export function isCapped(
  history: readonly RetentionSentRecord[],
  now: Date,
): boolean {
  const ageHours = (record: RetentionSentRecord): number =>
    (now.getTime() - record.sentAt.getTime()) / HOUR_MS;

  return (
    history.some(
      (record) => ageHours(record) < RETENTION_PUSH_DAILY_WINDOW_HOURS,
    ) ||
    history.filter(
      (record) => ageHours(record) < RETENTION_PUSH_WEEKLY_WINDOW_HOURS,
    ).length >= RETENTION_PUSH_WEEKLY_CAP
  );
}

/** 쿨다운 안의 규칙은 건너뛰고 첫 번째를 고른다 */
export function pickCandidate(
  candidates: readonly RetentionCandidate[],
  history: readonly RetentionSentRecord[],
  now: Date,
  rules: readonly RetentionRuleDefinition[] = RETENTION_RULES,
): RetentionCandidate | null {
  return (
    candidates.find((candidate) => {
      const rule = rules.find((item) => item.key === candidate.ruleKey);

      if (!rule) {
        return false;
      }

      return !history.some(
        (record) =>
          record.ruleKey === candidate.ruleKey &&
          now.getTime() - record.sentAt.getTime() <
            rule.cooldownHours * HOUR_MS,
      );
    }) ?? null
  );
}

/**
 * 문구 변형 배정 — `사용자 · 규칙 · 주` 해시. 같은 주에는 같은 변형이 가서 반응률을 변형별로 비교할 수 있고,
 * 주가 바뀌면 다시 섞인다. 무작위가 아니라 해시라 재실행해도 같다.
 */
export function assignVariant(
  userId: string,
  ruleKey: RetentionRuleKey,
  weekStart: string,
  variantCount: number,
): number {
  if (variantCount <= 1) {
    return 0;
  }

  // FNV-1a 32bit
  let hash = 0x811c9dc5;

  for (const char of `${userId}|${ruleKey}|${weekStart}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash % variantCount;
}

/** `{변수}`를 채운다. 없는 변수는 그대로 남는다 — 테스트가 남은 `{`를 잡는다 */
export function fillTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * 광고성 정보 표기(정보통신망법 50조 4항 — KISA 불법스팸 방지 안내서). 앱 푸시 광고는 **전송자 명칭 · 광고 표시 ·
 * 수신거부 방법**을 밝힌다. 전송자 명칭은 OS 가 알림에 앱 이름을 띄워 갈음하고, 나머지 둘을 여기서 붙인다.
 * 영어 문구도 같은 법의 적용을 받는 같은 사업자의 발송이라 같은 표기를 한다.
 */
export function withAdNotice(
  copy: RetentionCopy,
  language: MessageLanguage,
): RetentionCopy {
  return language === MessageLanguage.EN
    ? {
        title: `(Ad) ${copy.title}`,
        body: `${copy.body}\nOpt out: Settings > Notifications`,
      }
    : {
        title: `(광고) ${copy.title}`,
        body: `${copy.body}\n수신거부: 설정 > 알림`,
      };
}

export function retentionLogType(
  ruleKey: RetentionRuleKey,
  variant: number,
): `retention.${string}` {
  return `retention.${ruleKey}.${String.fromCharCode(97 + variant)}`;
}

/** `retention.<규칙>.<변형>` → 규칙. 모르는 규칙(지운 규칙의 지난 기록)은 null */
export function parseRetentionLogType(type: string): RetentionRuleKey | null {
  if (!type.startsWith(RETENTION_LOG_TYPE_PREFIX)) {
    return null;
  }

  const key = type.slice(RETENTION_LOG_TYPE_PREFIX.length).split('.')[0];

  return (Object.values(RetentionRuleKey) as string[]).includes(key)
    ? (key as RetentionRuleKey)
    : null;
}

/**
 * 한 사용자의 알림을 정한다 — 빈도 제한 → 후보 → 쿨다운 → 변형 → 문구 → 광고 표기.
 * 보내지 않을 사용자는 null.
 */
export function planRetentionPush(params: {
  user: RetentionUserFacts;
  market: RetentionMarketFacts;
  history: readonly RetentionSentRecord[];
  language: MessageLanguage;
  weekStart: string;
  now: Date;
  rules?: readonly RetentionRuleDefinition[];
}): RetentionPushPlan | null {
  const rules = params.rules ?? RETENTION_RULES;

  if (isCapped(params.history, params.now)) {
    return null;
  }

  const candidate = pickCandidate(
    evaluateCandidates(params.user, params.market, rules),
    params.history,
    params.now,
    rules,
  );
  const rule =
    candidate && rules.find((item) => item.key === candidate.ruleKey);
  const variants = rule?.copy[params.language] ?? [];

  if (!candidate || variants.length === 0) {
    return null;
  }

  const variant = assignVariant(
    params.user.userId,
    candidate.ruleKey,
    params.weekStart,
    variants.length,
  );
  const copy = withAdNotice(
    {
      title: fillTemplate(variants[variant].title, candidate.vars),
      body: fillTemplate(variants[variant].body, candidate.vars),
    },
    params.language,
  );

  return {
    userId: params.user.userId,
    ruleKey: candidate.ruleKey,
    variant,
    title: copy.title,
    body: copy.body,
    deepLink: candidate.deepLink,
  };
}
