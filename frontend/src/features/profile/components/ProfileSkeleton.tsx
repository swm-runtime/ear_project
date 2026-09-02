import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

/**
 * P6 최초 조회 스켈레톤(profile-uiux.md 4.9) — 헤더(사진·닉네임·이메일·플랜 자리) + 카드 2장 +
 * 통계 영역(요약 3분할 + 그래프 자리). 설정 아이콘·화면 제목은 화면이 스켈레톤 밖에 즉시
 * 노출하므로 여기 없다. 0.3초 미만 미표시는 화면이 useDelayedVisible로 감싼다.
 *
 * **헤더 자리는 실제 헤더와 같은 배치로 둔다** — 모양이 다르면 로딩이 끝나는 순간
 * 아래 카드들이 위아래로 튄다.
 */
export default function ProfileSkeleton() {
  return (
    <View
      style={styles.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.header}>
        <View style={styles.avatar} />
        <View style={styles.names}>
          <View style={styles.nickname} />
          <View style={styles.email} />
        </View>
      </View>
      <View style={styles.planLine} />
      {/* 관심 주제 · 커리어 카드 2장 */}
      {[0, 1].map((cardIndex) => (
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
  // ProfileHeader와 같은 배치·같은 치수(가로 배치, 아바타 64, 하단 여백 lg)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.color.surface,
  },
  names: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  nickname: {
    width: 120,
    height: theme.font.size.lg,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  email: {
    width: 168,
    height: theme.font.size.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  planLine: {
    width: 180,
    height: theme.font.size.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    marginLeft: 64 + theme.spacing.md,
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
