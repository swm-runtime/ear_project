import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

/**
 * P6 최초 조회 스켈레톤(profile-uiux.md 4.9) — 헤더 닉네임 자리 + 카드 4개 + 통계 영역
 * (요약 3분할 + 그래프 자리). 설정 아이콘은 화면이 스켈레톤 밖에 즉시 노출하므로 여기 없다.
 * 0.3초 미만 미표시는 화면이 useDelayedVisible로 감싼다.
 */
export default function ProfileSkeleton() {
  return (
    <View
      style={styles.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.nickname} />
      {[0, 1, 2, 3].map((cardIndex) => (
        <View key={cardIndex} style={styles.card} />
      ))}
      <View style={styles.tilesRow}>
        {[0, 1, 2].map((tileIndex) => (
          <View key={tileIndex} style={styles.tile} />
        ))}
      </View>
      <View style={styles.chart} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    overflow: 'hidden',
  },
  nickname: {
    width: 120,
    height: theme.font.size.xl,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  card: {
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  tile: {
    flex: 1,
    height: 84,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  chart: {
    height: 150,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
});
