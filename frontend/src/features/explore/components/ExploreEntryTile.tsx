import type { ExploreEntry, ExploreItem, ExploreSeries } from '../explore.types';
import ExploreSeriesTile from './ExploreSeriesTile';
import ExploreTile from './ExploreTile';

interface ExploreEntryTileProps {
  entry: ExploreEntry;
  /** 콘텐츠 타일 탭 = 곧장 재생 판정(explore-uiux.md 4.1) */
  onPress: (item: ExploreItem) => void;
  onMorePress: (item: ExploreItem) => void;
  /** 시리즈 카드 탭 = 시리즈 화면(E14) — 재생이 아니다(explore.md 4.4 예외) */
  onSeriesPress: (series: ExploreSeries) => void;
  layout?: 'carousel' | 'grid';
}

/**
 * 섞인 목록(explore-api.md 4.1-1)의 사각 타일 한 칸 — 콘텐츠면 ExploreTile, 시리즈면 같은 크기의 시리즈 카드다.
 * 피드 캐러셀·주제 격자·검색 결과·검색 fallback 이 전부 이 한 곳에서 종류를 가른다
 */
export default function ExploreEntryTile({
  entry,
  onPress,
  onMorePress,
  onSeriesPress,
  layout = 'carousel',
}: ExploreEntryTileProps) {
  if (entry.type === 'series') {
    return <ExploreSeriesTile series={entry.series} onPress={onSeriesPress} layout={layout} />;
  }
  return <ExploreTile item={entry} onPress={onPress} onMorePress={onMorePress} layout={layout} />;
}
