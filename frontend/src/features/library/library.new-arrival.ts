import type { LibraryItem } from './library.types';

interface DripArrivalResult {
  /** 다음 비교에 쓸 기준값 — 드립의 최대 addedAt. 뒤로 물러나지 않는다 */
  baseline: string | null;
  /** 배너에 쓸 새 드립 수 — 0이면 배너를 띄우지 않는다 */
  newCount: number;
}

/**
 * "새 콘텐츠 N개 도착" 판정(library-api.md 4.1 · library.md 4.6, 개정 2026-08-08).
 * 배너가 알리는 사건은 드립 도착 하나다:
 * - source = drip만 센다 — 담기(save)·온보딩 적립은 사용자가 스스로 한 조작이라 알리지 않는다
 * - 기준값은 목록 최상단이 아니라 드립의 최대 addedAt — 정렬·방금 담은 항목과 무관해야 한다
 * - 드립이 0건인 조회(출처 필터·주제 필터)는 기준값을 건드리지 않고 지나간다 — 필터를 푼 뒤
 *   그동안 도착한 드립을 놓치지도, 전부 새 것으로 세지도 않게
 * - 기준값은 단조 증가다 — 옛 드립만 보이는 조회가 기준값을 되돌리면 이미 본 드립이 다시 새 것이 된다
 */
export const evaluateDripArrivals = (
  items: readonly Pick<LibraryItem, 'source' | 'addedAt'>[],
  prevBaseline: string | null,
): DripArrivalResult => {
  const drips = items.filter((item) => item.source === 'drip');
  if (drips.length === 0) return { baseline: prevBaseline, newCount: 0 };

  const maxAddedAt = drips.reduce(
    (max, item) => (item.addedAt > max ? item.addedAt : max),
    drips[0].addedAt,
  );

  // 첫 관측은 배너 없이 기준값만 기록한다(library-api.md 4.1 — 기준값이 없을 때)
  if (prevBaseline === null) return { baseline: maxAddedAt, newCount: 0 };

  return {
    baseline: maxAddedAt > prevBaseline ? maxAddedAt : prevBaseline,
    newCount: drips.filter((item) => item.addedAt > prevBaseline).length,
  };
};
