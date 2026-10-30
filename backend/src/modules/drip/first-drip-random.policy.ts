/**
 * 첫 드립 주제 안 무작위 선정(KAN-291 — 단기 실험 ⑥, `FIRST_DRIP_RANDOM_ENABLED`).
 *
 * 콜드스타트 스코어링은 인기·신선도 비중이 커서 같은 주제를 고른 신규 가입자가 비슷한 편을 받는다. 이 실험은
 * 관심 주제 안의 후보를 **균등 무작위로** 골라 노출을 퍼뜨린다. 판정은 순수 함수로 두고 난수는 호출자가 넣는다 —
 * 테스트가 시드 난수로 결과를 고정할 수 있어야 하기 때문이다.
 *
 * **주제 순환**: 사용자가 주제를 여러 개 골랐으면 한 주제에서 전부 가져오지 않는다. 주제 순서를 섞은 뒤 한 편씩
 * 돌아가며, 그 주제에 걸린 아직 안 뽑힌 후보 중 섞인 순서의 첫 편을 고른다. 어느 주제에도 남은 후보가 없을 때만
 * 나머지를 섞인 순서대로 채운다. 한 주제 안에서는 균등 무작위다.
 */

/** `[0, 1)` 난수 — `Math.random`과 같은 계약 */
export type RandomSource = () => number;

/** Fisher–Yates — 원본을 바꾸지 않는다 */
export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

export interface RandomFirstDripCandidate {
  contentId: string;
  topicIds: string[];
}

/**
 * 후보 중 `count`편을 주제 순환 + 주제 안 균등 무작위로 고른다. 후보가 모자라면 있는 만큼만 돌려준다
 * (모자란 몫은 호출자의 인기 대체 편성이 채운다).
 */
export function pickRandomFirstDrip(
  candidates: readonly RandomFirstDripCandidate[],
  activeTopicIds: readonly string[],
  count: number,
  random: RandomSource,
): string[] {
  if (count <= 0 || candidates.length === 0) {
    return [];
  }

  const shuffled = shuffle(candidates, random);
  const topicOrder = shuffle(activeTopicIds, random);
  const picked = new Set<string>();
  const result: string[] = [];

  const take = (contentId: string) => {
    picked.add(contentId);
    result.push(contentId);
  };

  let progressed = true;
  while (result.length < count && progressed) {
    progressed = false;

    for (const topicId of topicOrder) {
      if (result.length >= count) {
        break;
      }

      const next = shuffled.find(
        (candidate) =>
          !picked.has(candidate.contentId) &&
          candidate.topicIds.includes(topicId),
      );

      if (next) {
        take(next.contentId);
        progressed = true;
      }
    }
  }

  // 주제 연결 조회가 비었거나(방어) 순환으로 다 못 채웠으면 섞인 순서대로 나머지를 채운다
  for (const candidate of shuffled) {
    if (result.length >= count) {
      break;
    }

    if (!picked.has(candidate.contentId)) {
      take(candidate.contentId);
    }
  }

  return result;
}
