import { MAX_AUTO_EXPAND_TOPIC_COUNT } from '@/modules/interest/interest.constant';

import {
  AUTO_EXPAND_EXPIRE_DAYS,
  AUTO_EXPAND_LOOKBACK_DAYS,
  AUTO_EXPAND_MIN_COMPLETES,
  AUTO_EXPAND_REPLACE_MARGIN,
} from './drip.constant';
import { PreferenceSignalAction } from './drip.enum';
import { PreferenceSignalInput } from './drip.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 슬롯을 "살아 있다"고 보는 신호 — 부정·무시·단순 재생은 세지 않는다 */
const POSITIVE_ACTIONS: readonly PreferenceSignalAction[] = [
  PreferenceSignalAction.COMPLETE,
  PreferenceSignalAction.REPLAY,
  PreferenceSignalAction.SAVE,
];

export interface AutoExpandInterest {
  topicId: string;
  /** `user_interests.source = auto_expand`인가 — 직접 고른 주제는 교체·만료 대상이 아니다 */
  isAutoExpand: boolean;
  /** 그 행이 마지막으로 바뀐 시각(`updated_at`) — 자동 슬롯에서는 "자동 추가된 시각"이다 */
  activatedAt: Date;
}

export interface AutoExpandInput {
  now: Date;
  /** 취향 캐시 계산과 **같은 신호 입력**(최근 90일) — 판정 재료를 따로 조회하지 않는다 */
  signals: PreferenceSignalInput[];
  topicIdsByContentId: Map<string, string[]>;
  /** 취향 캐시의 주제 가중치(신호별 가중 × 최근성 감쇠) — 후보 순위와 교체 비교에 쓴다 */
  topicWeights: Record<string, number>;
  activeInterests: AutoExpandInterest[];
  /** 사용자가 직접 해제한 주제 — 다시 넣지 않는다(FR-06) */
  userRemovedTopicIds: string[];
  /** 고를 수 없는 주제(숨김·삭제) — 호출자가 후보를 본 뒤 채워 다시 부른다 */
  unavailableTopicIds?: string[];
  slotLimit?: number;
}

export interface AutoExpandCandidate {
  topicId: string;
  /** 관찰 창 안에 완청한 서로 다른 콘텐츠 수 */
  completes: number;
  weight: number;
}

export type AutoExpandAction = 'none' | 'add' | 'replace' | 'expire';

export type AutoExpandReason =
  /** 트리거를 넘긴 관심 밖 주제가 없다 */
  | 'no_candidate'
  /** 슬롯이 비어 있어 후보를 넣는다 */
  | 'slot_free'
  /** 슬롯이 찼고 후보가 교체 여유를 넘지 못했다 */
  | 'slot_kept'
  /** 후보의 가중치가 슬롯을 교체 여유 이상으로 넘었다 */
  | 'stronger_candidate'
  /** 슬롯 주제에 만료 기간 동안 긍정 신호가 없었다 */
  | 'slot_expired'
  /** 사용자가 자동 확장을 껐다 — 호출자가 덮어쓴다 */
  | 'disabled'
  /** 서버 스위치(`AUTO_EXPAND_ENABLED`)가 꺼져 있다 — 호출자가 덮어쓴다 */
  | 'feature_off';

export interface AutoExpandDecision {
  action: AutoExpandAction;
  reason: AutoExpandReason;
  addTopicId: string | null;
  removeTopicId: string | null;
  /** 트리거를 넘긴 후보 — 강한 순. 콘솔이 "왜 이 주제인가"를 보이는 재료다 */
  candidates: AutoExpandCandidate[];
}

/**
 * 행동 기반 자동 확장 판정(`drip-scheduling.md` 4.5 — 개정 2026-09-30). **계산만 한다.**
 *
 * 관심 밖 주제를 최근에 스스로 찾아 듣는 사용자에게 그 주제를 **자동 슬롯 하나**로 붙인다. 정규 편성 후보가
 * 관심 주제 안으로 잘려 있어(4.2), 이 판정 없이는 행동이 아무리 쌓여도 그 주제가 편성에 들어오지 못한다.
 *
 * - **직접 고른 주제는 건드리지 않는다.** 교체·만료는 자동 슬롯 안에서만 일어난다.
 * - 한 번의 판정은 주제를 **최대 1개** 넣는다(만료된 슬롯을 같은 판정에서 새 후보로 채우는 것 포함).
 * - 토글(`auto_expand_enabled`)과 주제 노출 여부는 조회가 필요해 호출자가 본다 — 여기는 순수 함수다.
 */
export function decideAutoExpand(input: AutoExpandInput): AutoExpandDecision {
  const slotLimit = input.slotLimit ?? MAX_AUTO_EXPAND_TOPIC_COUNT;
  const activeTopicIds = new Set(
    input.activeInterests.map((interest) => interest.topicId),
  );
  const blocked = new Set([
    ...input.userRemovedTopicIds,
    ...(input.unavailableTopicIds ?? []),
  ]);
  const lookbackStart =
    input.now.getTime() - AUTO_EXPAND_LOOKBACK_DAYS * MS_PER_DAY;
  const expireBefore =
    input.now.getTime() - AUTO_EXPAND_EXPIRE_DAYS * MS_PER_DAY;

  const completedByTopic = new Map<string, Set<string>>();
  const lastPositiveAt = new Map<string, number>();

  for (const signal of input.signals) {
    if (!POSITIVE_ACTIONS.includes(signal.action)) {
      continue;
    }

    const at = signal.createdAt.getTime();

    for (const topicId of input.topicIdsByContentId.get(signal.contentId) ??
      []) {
      lastPositiveAt.set(
        topicId,
        Math.max(lastPositiveAt.get(topicId) ?? 0, at),
      );

      if (
        signal.action === PreferenceSignalAction.COMPLETE &&
        at >= lookbackStart
      ) {
        const contents = completedByTopic.get(topicId) ?? new Set<string>();
        contents.add(signal.contentId);
        completedByTopic.set(topicId, contents);
      }
    }
  }

  const candidates: AutoExpandCandidate[] = [...completedByTopic.entries()]
    .filter(
      ([topicId, contents]) =>
        !activeTopicIds.has(topicId) &&
        !blocked.has(topicId) &&
        contents.size >= AUTO_EXPAND_MIN_COMPLETES,
    )
    .map(([topicId, contents]) => ({
      topicId,
      completes: contents.size,
      weight: input.topicWeights[topicId] ?? 0,
    }))
    // 완청 뒤에 삭제·해제가 쌓여 가중치가 0 이하로 내려간 주제는 "좋아한다"가 아니다
    .filter((candidate) => candidate.weight > 0)
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        b.completes - a.completes ||
        a.topicId.localeCompare(b.topicId),
    );

  const slots = input.activeInterests.filter(
    (interest) => interest.isAutoExpand,
  );
  const best = candidates[0] ?? null;
  const decision = (
    action: AutoExpandAction,
    reason: AutoExpandReason,
    addTopicId: string | null,
    removeTopicId: string | null,
  ): AutoExpandDecision => ({
    action,
    reason,
    addTopicId,
    removeTopicId,
    candidates,
  });

  // 1) 만료 — 추가된 지 만료 기간이 지났고 그 사이 긍정 신호가 없는 슬롯. 가장 오래된 것부터 하나
  const expired = slots
    .filter(
      (slot) =>
        slot.activatedAt.getTime() < expireBefore &&
        (lastPositiveAt.get(slot.topicId) ?? 0) < expireBefore,
    )
    .sort((a, b) => a.activatedAt.getTime() - b.activatedAt.getTime())[0];

  if (expired) {
    const hasRoom = slots.length - 1 < slotLimit;

    return best && hasRoom
      ? decision('replace', 'slot_expired', best.topicId, expired.topicId)
      : decision('expire', 'slot_expired', null, expired.topicId);
  }

  // 2) 빈 슬롯
  if (slots.length < slotLimit) {
    return best
      ? decision('add', 'slot_free', best.topicId, null)
      : decision('none', 'no_candidate', null, null);
  }

  // 3) 교체 — 가장 약한 슬롯과 비교한다
  if (!best) {
    return decision('none', 'no_candidate', null, null);
  }

  const weakest = [...slots].sort(
    (a, b) =>
      (input.topicWeights[a.topicId] ?? 0) -
      (input.topicWeights[b.topicId] ?? 0),
  )[0];
  const slotWeight = Math.max(input.topicWeights[weakest.topicId] ?? 0, 0);

  return best.weight > slotWeight * AUTO_EXPAND_REPLACE_MARGIN
    ? decision('replace', 'stronger_candidate', best.topicId, weakest.topicId)
    : decision('none', 'slot_kept', null, null);
}
