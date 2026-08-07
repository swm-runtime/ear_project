import { Content } from '@/modules/content/entities/content.entity';
import { UserSignalView } from '@/modules/playback/playback.types';

import {
  SIGNAL_RECENCY_WINDOW_DAYS,
  SIGNAL_TOPIC_WEIGHTS,
} from './explore.constant';

/**
 * 관심사 섹션의 재정렬(`explore.md` 4.1 — `UserInterest` + 소비 신호 기반 랭킹, FR-15).
 *
 * **순수 함수로 분리한 이유**: 랭킹은 조회가 아니라 판정이라 Repository에 둘 수 없고
 * (architecture.md 3.2), 값만 넣으면 결과가 정해지므로 DB 없이 검증할 수 있어야 한다.
 *
 * **가중치 자체는 `drip-scheduling.md` 4.3이 소유한다.** 여기서 새로 정하지 않고
 * `explore.constant.ts`의 표를 적용할 뿐이다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 신호를 주제 가중치로 환산한다.
 *
 * **최근성 가중을 둔다**(`drip-scheduling.md` 4.3 — 오래된 신호일수록 영향이 감소한다).
 * 창의 끝에서 0이 되도록 선형으로 감쇠시킨다 — 지수 감쇠와 달리 반감기라는 추가 상수가
 * 필요 없고, 창 밖 신호가 0이 되는 지점이 조회 조건과 일치한다.
 *
 * 한 콘텐츠가 여러 주제를 가지면 **각 주제에 같은 값을 더한다.** 주제 수로 나누면 주제가
 * 많은 콘텐츠의 신호가 약해지는데, 그것은 사용자의 취향이 아니라 태깅 방식의 문제다.
 */
export function toTopicWeights(
  signals: UserSignalView[],
  topicIdsByContentId: Map<string, string[]>,
  now: Date,
): Map<string, number> {
  const weights = new Map<string, number>();

  for (const signal of signals) {
    const actionWeight = SIGNAL_TOPIC_WEIGHTS[signal.action];

    if (actionWeight === undefined) {
      continue;
    }

    const recency = toRecencyFactor(signal.createdAt, now);

    if (recency <= 0) {
      continue;
    }

    for (const topicId of topicIdsByContentId.get(signal.contentId) ?? []) {
      weights.set(
        topicId,
        (weights.get(topicId) ?? 0) + actionWeight * recency,
      );
    }
  }

  return weights;
}

/**
 * 주제 가중치로 후보를 다시 정렬한다.
 *
 * **입력 순서를 tie-break로 쓴다.** 후보는 인기·신선도 순으로 들어오므로, 신호 점수가 같은
 * 콘텐츠끼리는 그 순서가 유지된다(`Array.prototype.sort`는 안정 정렬이다). 신호가 하나도
 * 없는 사용자에게 이 함수를 통과시켜도 순서가 바뀌지 않는 것이 그래서다.
 *
 * **입력 배열을 바꾸지 않는다** — 호출부가 같은 후보 목록을 다른 섹션에도 쓴다.
 */
export function rankByTopicWeights(
  contents: Content[],
  topicIdsByContentId: Map<string, string[]>,
  topicWeights: Map<string, number>,
): Content[] {
  if (topicWeights.size === 0) {
    return [...contents];
  }

  const scores = new Map(
    contents.map((content) => [
      content.id,
      toContentScore(topicIdsByContentId.get(content.id) ?? [], topicWeights),
    ]),
  );

  return [...contents].sort(
    (left, right) => (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0),
  );
}

/**
 * 창의 시작에서 1, 끝에서 0. 창을 벗어난 신호는 애초에 조회되지 않는다.
 *
 * 위쪽도 1로 자른다 — 기기 시각이 앞서 있어 미래로 기록된 신호가 다른 신호보다 무거워지면
 * 안 된다.
 */
function toRecencyFactor(createdAt: Date, now: Date): number {
  const ageDays = (now.getTime() - createdAt.getTime()) / DAY_MS;

  return Math.min(1, Math.max(0, 1 - ageDays / SIGNAL_RECENCY_WINDOW_DAYS));
}

function toContentScore(
  topicIds: string[],
  topicWeights: Map<string, number>,
): number {
  return topicIds.reduce(
    (score, topicId) => score + (topicWeights.get(topicId) ?? 0),
    0,
  );
}
