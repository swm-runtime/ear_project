import { Content } from '@/modules/content/entities/content.entity';

/**
 * 관심사 섹션의 재정렬(`explore.md` 4.1 — `UserInterest` + 소비 신호 기반 랭킹, FR-15).
 *
 * **순수 함수로 분리한 이유**: 랭킹은 조회가 아니라 판정이라 Repository에 둘 수 없고
 * (architecture.md 3.2), 값만 넣으면 결과가 정해지므로 DB 없이 검증할 수 있어야 한다.
 *
 * **신호를 여기서 해석하지 않는다.** 신호 → 주제 가중치 환산은 `drip-scheduling.md` 4.3의
 * 규칙이고 그 구현은 편성 배치의 `PreferenceVectorService` 한 곳에 있다(domain.md 7.2 —
 * "탐색 피드 랭킹도 이 캐시를 읽는다"). 이 파일은 이미 접힌 가중치를 후보에 적용할 뿐이다.
 */

/**
 * 주제 가중치로 후보를 다시 정렬한다.
 *
 * **입력 순서를 tie-break로 쓴다.** 후보는 인기·신선도 순으로 들어오므로, 주제 점수가 같은
 * 콘텐츠끼리는 그 순서가 유지된다(`Array.prototype.sort`는 안정 정렬이다). 가중치가 하나도
 * 없는 사용자에게 이 함수를 통과시켜도 순서가 바뀌지 않는 것이 그래서다.
 *
 * **입력 배열을 바꾸지 않는다** — 호출부가 같은 후보 목록을 다른 섹션에도 쓴다.
 */
export function rankByTopicWeights(
  contents: Content[],
  topicIdsByContentId: Map<string, string[]>,
  topicWeights: Record<string, number>,
): Content[] {
  if (Object.keys(topicWeights).length === 0) {
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
 * 한 콘텐츠가 여러 주제를 가지면 **각 주제의 가중치를 더한다.** 주제 수로 나누면 주제가 많은
 * 콘텐츠가 불리해지는데, 그것은 사용자의 취향이 아니라 태깅 방식의 문제다.
 */
function toContentScore(
  topicIds: string[],
  topicWeights: Record<string, number>,
): number {
  return topicIds.reduce(
    (score, topicId) => score + (topicWeights[topicId] ?? 0),
    0,
  );
}
