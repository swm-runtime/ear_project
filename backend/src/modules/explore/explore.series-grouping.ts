import { Content } from '@/modules/content/entities/content.entity';

/**
 * 탐색 시리즈 카드(KAN-134 확정 설계 4번) — 순위순 편 목록을 "시리즈마다 한 번" 목록으로 접는 순수 규칙. **메모리에서 줄 세우는
 * 피드 섹션(관심사·주제별)에만 쓴다** — 커서 목록(주제별·인기·검색)과 인기·새로 나온 섹션은 SQL 윈도가 대표 편을 고른다
 * (`ContentRepository.applySeriesAnchors`). 두 곳의 대표 규칙은 같다 — 그 목록의 순위로 가장 앞 편.
 *
 * **카드의 자리 = 그 시리즈 편 중 순위가 가장 높은 편의 자리**(= 편 점수의 최댓값, 확정한 세부). 순위순으로 훑으며 시리즈를 처음
 * 만난 편에서 카드를 내고, 그 시리즈의 나머지 편은 건너뛴다. 단일 콘텐츠는 그대로 나온다.
 */
export function groupBySeries(
  contents: Content[],
  limit: number,
  seen: Set<string> = new Set(),
): Content[] {
  const grouped: Content[] = [];

  for (const content of contents) {
    if (grouped.length >= limit) {
      break;
    }
    const { seriesId } = content;
    if (typeof seriesId === 'string') {
      if (seen.has(seriesId)) {
        continue;
      }
      seen.add(seriesId);
    }
    grouped.push(content);
  }

  return grouped;
}
