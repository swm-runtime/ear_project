import type { ExploreEntry, ExploreItem, ExploreSeries } from './explore.types';

/** 시리즈 화면 아래 가로 목록 한 줄의 칸 수 — 탐색 피드 섹션과 같다 */
export const SERIES_MORE_LIMIT = 10;

/**
 * "다른 시리즈 더보기" — 여러 목록(같은 주제 목록 → 탐색 피드 섹션 순)에서 시리즈 카드만 앞에서부터 모은다. 지금 보는
 * 시리즈와 이미 모은 시리즈는 건너뛴다. 순서는 넘겨받은 목록 순서 그대로(서버 순위) — 클라이언트가 다시 줄 세우지 않는다
 */
export const pickOtherSeries = (
  currentSeriesId: string,
  lists: readonly (readonly ExploreEntry[])[],
  limit = SERIES_MORE_LIMIT,
): ExploreSeries[] => {
  const seen = new Set<string>([currentSeriesId]);
  const picked: ExploreSeries[] = [];
  for (const list of lists) {
    for (const entry of list) {
      if (entry.type !== 'series' || seen.has(entry.series.id)) continue;
      seen.add(entry.series.id);
      picked.push(entry.series);
      if (picked.length >= limit) return picked;
    }
  }
  return picked;
};

/**
 * "좋아할 만한 다른 항목" — 관련 콘텐츠(KAN-240)에서 이 시리즈의 편을 뺀다(서버에 편 id 를 제외로 보내지만, 50개 상한을
 * 넘는 시리즈나 새로 공개된 편이 섞여도 한 번 더 거른다)
 */
export const withoutSeriesEpisodes = (
  seriesId: string,
  items: readonly ExploreItem[],
  limit = SERIES_MORE_LIMIT,
): ExploreItem[] => items.filter((item) => item.content.series?.id !== seriesId).slice(0, limit);
