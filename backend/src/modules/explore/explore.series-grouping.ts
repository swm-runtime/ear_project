import { Content } from '@/modules/content/entities/content.entity';

import { GROUPED_PAGE_MAX_ROUNDS } from './explore.constant';

/**
 * 탐색 시리즈 카드(KAN-134 확정 설계 4번) — 순위순 편 목록을 "시리즈마다 한 번" 목록으로 접는 순수 규칙.
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

export interface GroupedPage<R> {
  /** 낼 행 — 시리즈 행은 그 시리즈의 카드 자리(가장 앞 순위 편)다 */
  emitted: R[];
  /** 마지막으로 **훑은** 행(낸 행이 아니다) — 다음 커서의 위치. 건너뛴 행도 다시 읽지 않게 여기서 이어 간다 */
  lastScanned: R | null;
  hasNext: boolean;
}

/**
 * 커서 페이지를 시리즈 단위로 접어 채운다. 건너뛴 편 때문에 한 번 읽은 행으로 `limit`을 못 채우면 **마지막으로 훑은 위치에서
 * 이어 읽는다**(최대 `GROUPED_PAGE_MAX_ROUNDS`번). `seen`은 앞 페이지까지 낸 시리즈(커서의 `g`)이고 이 함수가 새로 낸 시리즈를
 * 더한다 — 다음 커서에 그대로 싣는다.
 *
 * - **중복이 없다** — 한 시리즈는 목록 전체에서 한 번(앞 페이지 포함, `seen`), 단일 콘텐츠는 키셋 커서가 한 번만 읽는다.
 * - **커서가 안정적이다** — 위치는 원래 정렬 키 그대로(훑은 마지막 행), `g`는 정렬해 담는다. 같은 데이터·같은 커서면 같은 페이지다.
 * - `limit`을 채운 행 뒤에 같은 묶음의 행이 남아 있으면 `hasNext`다(그 행은 다음 페이지가 다시 읽는다).
 * - 상한까지 이어 읽어도 못 채우면 채운 만큼 내고 `hasNext`를 유지한다 — 다음 페이지가 이어 읽는다(빈 페이지일 수 있다).
 */
export async function collectGroupedPage<
  R extends { content: Pick<Content, 'seriesId'> },
  P,
>(
  fetchPage: (cursor: P | null) => Promise<{ items: R[]; hasNext: boolean }>,
  start: P | null,
  limit: number,
  seen: Set<string>,
  positionOf: (row: R) => P,
  maxRounds: number = GROUPED_PAGE_MAX_ROUNDS,
): Promise<GroupedPage<R>> {
  const emitted: R[] = [];
  let lastScanned: R | null = null;
  let cursor = start;

  for (let round = 0; round < maxRounds; round += 1) {
    const page = await fetchPage(cursor);

    for (let index = 0; index < page.items.length; index += 1) {
      const row = page.items[index];
      lastScanned = row;
      const { seriesId } = row.content;

      if (typeof seriesId === 'string') {
        if (seen.has(seriesId)) {
          continue;
        }
        seen.add(seriesId);
      }

      emitted.push(row);

      if (emitted.length >= limit) {
        return {
          emitted,
          lastScanned,
          hasNext: index < page.items.length - 1 || page.hasNext,
        };
      }
    }

    if (!page.hasNext || lastScanned === null) {
      return { emitted, lastScanned, hasNext: false };
    }

    cursor = positionOf(lastScanned);
  }

  return { emitted, lastScanned, hasNext: true };
}
