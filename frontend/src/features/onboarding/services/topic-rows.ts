/** 마퀴 줄 수 상한 — 화면 세로에 맞춘 값이다(시각 개편 2026-09-03) */
export const MAX_MARQUEE_ROWS = 4;
/**
 * 줄당 최소 주제 수 — 이보다 적게 나뉘면 한 줄이 한 벌로도 뷰포트를 못 채워 같은 알약이 연달아 반복돼 보인다.
 * (벌 수는 뷰포트에 맞춰 늘어나므로 이음새는 없지만, 한 알약이 세 번 흐르는 줄은 목록이 아니라 오류로 읽힌다)
 */
export const MIN_TOPICS_PER_ROW = 3;

/** 주제 수에 맞는 줄 수 — 1~3개면 1줄, 4~6개면 2줄, 7~9개면 3줄, 10개부터 4줄(상한) */
export const marqueeRowCount = (topicCount: number): number =>
  Math.max(1, Math.min(MAX_MARQUEE_ROWS, Math.ceil(topicCount / MIN_TOPICS_PER_ROW)));

/**
 * 칩을 줄에 라운드로빈으로 나눈다 — 세로 스크롤 없이 줄마다 가로로 흐른다.
 * 줄 수는 주제 수를 따른다(KAN-59 — 항상 4줄로 나누면 주제 1~7개에서 줄당 1개가 생겨 마퀴가 깨졌다).
 * 읽는 순서는 열 단위(위→아래)가 되지만 선택 동작·목록 순서 자체는 그대로다.
 */
export function toTopicRows<T>(items: T[]): T[][] {
  const rowCount = marqueeRowCount(items.length);
  const rows: T[][] = Array.from({ length: rowCount }, () => []);
  items.forEach((item, index) => rows[index % rowCount].push(item));
  return rows.filter((row) => row.length > 0);
}

/**
 * 무한 마퀴에 이어 붙일 벌 수 — 한 벌이 뷰포트보다 좁아도 이음새가 드러나지 않게 뷰포트를 덮고도 한 벌이
 * 남아야 한다. 되감기 구간(가운데 벌 기준 ±반 벌)까지 고려해 두 벌을 더한다. 3 미만으로는 내려가지 않는다 —
 * 가운데 벌(낭독 대상)·앞뒤 한 벌씩이 기존 구현의 전제다.
 */
export const marqueeCopyCount = (viewportWidth: number, copyWidth: number): number => {
  if (copyWidth <= 0 || viewportWidth <= 0) return 3;
  return Math.max(3, Math.ceil(viewportWidth / copyWidth) + 2);
};
