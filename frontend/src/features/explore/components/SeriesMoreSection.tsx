import { FlatList, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import type { ExploreEntry, ExploreItem, ExploreSeries } from '../explore.types';
import ExploreEntryTile from './ExploreEntryTile';

interface SeriesMoreSectionProps {
  title: string;
  entries: ExploreEntry[];
  onPress: (item: ExploreItem) => void;
  onMorePress: (item: ExploreItem) => void;
  onSeriesPress: (series: ExploreSeries) => void;
}

/**
 * 시리즈 화면 아래 가로 목록 한 줄(PM 2026-10-22 — 애플 뮤직 앨범 화면 아래 "다른 앨범" · "좋아할 만한 다른 항목").
 * 칸은 탐색 피드와 같은 타일(ExploreEntryTile)이다 — 콘텐츠 탭 = 재생 판정, 시리즈 카드 탭 = 그 시리즈 화면. 비면 그리지 않는다
 */
export default function SeriesMoreSection({
  title,
  entries,
  onPress,
  onMorePress,
  onSeriesPress,
}: SeriesMoreSectionProps) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.root}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <FlatList
        horizontal
        data={entries}
        keyExtractor={(entry) =>
          entry.type === 'series' ? `series-${entry.series.id}` : entry.content.id
        }
        renderItem={({ item }) => (
          <ExploreEntryTile
            entry={item}
            onPress={onPress}
            onMorePress={onMorePress}
            onSeriesPress={onSeriesPress}
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
        ItemSeparatorComponent={Gap}
      />
    </View>
  );
}

const Gap = () => <View style={styles.gap} />;

const styles = StyleSheet.create({
  // 제목 위 여백 — 아래(md)보다 조금 더(PM 2026-10-22 "제목 위에 공백 조금만 더"). 종전 위 lg · 아래 sm → 위아래 md → 위 md+xs
  root: {
    paddingTop: theme.spacing.md + theme.spacing.xs,
  },
  // 시리즈 하단 '다른 항목' 섹션 제목 — 앨범 본문보다 작게(PM 2026-10-22, 종전 탐색 피드 xl)
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  carousel: {
    paddingHorizontal: theme.spacing.md,
  },
  gap: {
    width: theme.spacing.md,
  },
});
