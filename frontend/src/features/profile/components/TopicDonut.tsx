import { useEffect } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

import { PROFILE_COPY } from '../profile.copy';
import type { TopicDistribution } from '../profile.types';

interface TopicDonutProps {
  distribution: TopicDistribution;
}

interface LegendEntry {
  key: string;
  name: string;
  ratio: number;
  color: string;
}

/** 서버 응답 순서 그대로다 — 재정렬·재계산하지 않는다(profile-uiux.md 4.6). "기타"는 항상 마지막 */
const toLegendEntries = (distribution: TopicDistribution): LegendEntry[] => {
  const palette = theme.color.chart;
  const othersColor = palette[palette.length - 1];
  return [
    ...distribution.topics.map((topic, index) => ({
      key: topic.topicId,
      name: topic.name,
      ratio: topic.ratio,
      color: palette[index % (palette.length - 1)],
    })),
    ...(distribution.othersRatio > 0
      ? [
          {
            key: 'others',
            name: PROFILE_COPY.stats.othersLabel,
            ratio: distribution.othersRatio,
            color: othersColor,
          },
        ]
      : []),
  ];
};

/** 전체 비율 막대 높이·주제별 막대 높이 */
const STACK_HEIGHT = 12;
const ROW_BAR_HEIGHT = 6;

/**
 * 주제 분포(profile-uiux.md 4.6) — **가로 누적 막대 + 순위 목록**(PM 2026-09-27 23:42, 종전 도넛에서 교체. iOS 스크린 타임
 * 카테고리 문법): 맨 위 1위 헤드라인("가장 많이 들은 주제 · 커리어 38%"), 전체를 주제별 색으로 나눈 막대 하나, 그 밑에
 * 주제마다 이름 · 그 비율만큼의 막대 · %. 도넛은 비슷한 조각끼리 비교가 안 되고(38 vs 31) 좁은 폭에서 범례가 접혔다.
 * 주간 그래프와 같은 회색 카드에 담는다. 나타날 때 막대가 0 에서 자라난다(scaleX, 네이티브 드라이버).
 *
 * 서버 비율 그대로 그린다(합 100 조정까지 서버 몫 — 재정규화 금지), 절대값(시간)은 표시하지 않는다. 막대는 장식이고
 * 목록 글자가 곧 대체 텍스트다(7장) — 색만으로 구분하지 않는다. 파일·이름은 호출부를 건드리지 않으려 그대로 둔다
 */
export default function TopicDonut({ distribution }: TopicDonutProps) {
  const entries = toLegendEntries(distribution);
  const grow = useAnimatedValue(0);
  useEffect(() => {
    if (entries.length === 0) return;
    Animated.spring(grow, { toValue: 1, ...motion.spring.smooth, useNativeDriver: true }).start();
  }, [entries.length, grow]);

  const top = distribution.topics[0];
  // scaleX 는 가운데 기준이라 왼쪽에서 자라게 하려면 폭의 절반만큼 되돌린다 — 폭을 모르므로 transformOrigin 을 쓴다
  const growStyle = { transform: [{ scaleX: grow }], transformOrigin: 'left' as const };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{PROFILE_COPY.stats.distributionTitle}</Text>
      {entries.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{PROFILE_COPY.stats.emptyState}</Text>
        </View>
      ) : (
        <View
          style={styles.card}
          accessible
          // 목록이 곧 대체 텍스트 — "커리어 38%, …, 기타 6%" 순서로 읽힌다(profile-uiux.md 7장)
          accessibilityLabel={PROFILE_COPY.stats.legendA11y(entries)}
        >
          {top ? (
            <View style={styles.headline}>
              <Text style={styles.headlineLabel}>{PROFILE_COPY.stats.topTopicLabel}</Text>
              <Text style={styles.headlineValue} numberOfLines={1}>
                {top.name}{' '}
                <Text style={styles.headlineRatio}>{PROFILE_COPY.stats.ratioValue(top.ratio)}</Text>
              </Text>
            </View>
          ) : null}

          <Animated.View style={[styles.stack, growStyle]}>
            {entries.map((entry) => (
              <View key={entry.key} style={{ flex: entry.ratio, backgroundColor: entry.color }} />
            ))}
          </Animated.View>

          <View style={styles.rows}>
            {entries.map((entry) => (
              <View key={entry.key} style={styles.row}>
                <View style={styles.rowHead}>
                  <View style={[styles.swatch, { backgroundColor: entry.color }]} />
                  <Text style={styles.rowName} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text style={styles.rowRatio}>{PROFILE_COPY.stats.ratioValue(entry.ratio)}</Text>
                </View>
                <View style={styles.rowTrack}>
                  <Animated.View
                    style={[
                      styles.rowBar,
                      { width: `${entry.ratio}%`, backgroundColor: entry.color },
                      growStyle,
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  // 주간 그래프(WeeklyChart)와 같은 카드
  card: {
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  headline: {
    gap: 2,
  },
  headlineLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  headlineValue: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  headlineRatio: {
    fontWeight: '600',
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  stack: {
    flexDirection: 'row',
    height: STACK_HEIGHT,
    borderRadius: STACK_HEIGHT / 2,
    overflow: 'hidden',
    gap: 2,
  },
  rows: {
    gap: theme.spacing.sm + 2,
  },
  row: {
    gap: 6,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  rowName: {
    flex: 1,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  rowRatio: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  rowTrack: {
    height: ROW_BAR_HEIGHT,
    borderRadius: ROW_BAR_HEIGHT / 2,
    backgroundColor: 'rgba(118, 118, 128, 0.12)',
    overflow: 'hidden',
  },
  rowBar: {
    height: ROW_BAR_HEIGHT,
    borderRadius: ROW_BAR_HEIGHT / 2,
  },
  emptyBox: {
    height: 140,
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
