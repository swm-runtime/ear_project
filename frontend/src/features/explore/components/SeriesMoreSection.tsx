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
  root: {
    paddingTop: theme.spacing.lg,
  },
  // 탐색 피드 섹션 제목과 같은 크기(xl 굵게)
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  carousel: {
    paddingHorizontal: theme.spacing.md,
  },
  gap: {
    width: theme.spacing.md,
  },
});
