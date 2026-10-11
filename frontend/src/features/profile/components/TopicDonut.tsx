import { useEffect } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme, useThemePalette } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { PROFILE_COPY } from '../profile.copy';
import type { TopicDistribution } from '../profile.types';

interface TopicDonutProps {
  distribution: TopicDistribution;
  /**
   * 주간 청취 카드 **안에** 들어간다(PM 2026-09-28 00:47 "주간 청취랑 합쳐봐") — 자기 카드(회색 면·패딩)를 그리지 않고
   * 부모 카드의 한 구획이 된다. 주별 주제 집계는 아직 서버에 없어(BE 요청 전) 전체 기간 값이므로 라벨에 기간을 밝힌다
   */
  embedded?: boolean;
  /**
   * 헤드라인 라벨 — 무슨 기간의 분포인지 밝힌다. 고른 주면 "가장 많이 들은 주제", 탭한 요일이면 "… · 화요일",
   * 서버가 주별 분포를 아직 안 보내면 "… · 전체 기간". 없으면 기본 라벨
   */
  label?: string;
}

interface LegendEntry {
  key: string;
  name: string;
  ratio: number;
  color: string;
}

/** 서버 응답 순서 그대로다 — 재정렬·재계산하지 않는다(profile-uiux.md 4.6). "기타"는 항상 마지막 */
/** `chart` — 지금 모드의 차트 색(문자열). SVG 조각·범례 점이 쓴다(다크 모드, 2026-10-10) */
const toLegendEntries = (
  distribution: TopicDistribution,
  chart: readonly string[],
): LegendEntry[] => {
  const palette = chart;
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
export default function TopicDonut({
  distribution,
  embedded = false,
  label = PROFILE_COPY.stats.topTopicLabel,
}: TopicDonutProps) {
  const entries = toLegendEntries(distribution, useThemePalette().chart);
  const grow = useAnimatedValue(0);
  // 분포가 바뀌면(주 이동 — PM 2026-09-28 04:15 "주마다") 막대가 0 에서 다시 자란다. 같은 분포면 다시 그리지 않는다
  const signature = entries.map((entry) => `${entry.key}:${entry.ratio}`).join('|');
  useEffect(() => {
    if (signature === '') return;
    grow.setValue(0);
    Animated.spring(grow, { toValue: 1, ...motion.spring.smooth, useNativeDriver: true }).start();
  }, [signature, grow]);

  const top = distribution.topics[0];
  // scaleX 는 가운데 기준이라 왼쪽에서 자라게 하려면 폭의 절반만큼 되돌린다 — 폭을 모르므로 transformOrigin 을 쓴다
  const growStyle = { transform: [{ scaleX: grow }], transformOrigin: 'left' as const };

  return (
    <View style={embedded ? styles.embeddedContainer : styles.container}>
      {/* 제목 "주로 듣는 주제"는 뺐다 — 카드 안 헤드라인 "가장 많이 들은 주제"와 겹친다(PM 2026-09-27 23:49) */}
      {entries.length === 0 ? (
        <View style={embedded ? styles.embeddedEmptyBox : styles.emptyBox}>
          <Text style={styles.emptyText}>{PROFILE_COPY.stats.emptyState}</Text>
        </View>
      ) : (
        <View
          style={embedded ? styles.embeddedBody : styles.card}
          accessible
          // 목록이 곧 대체 텍스트 — "커리어 38%, …, 기타 6%" 순서로 읽힌다(profile-uiux.md 7장)
          accessibilityLabel={PROFILE_COPY.stats.legendA11y(entries)}
        >
          {top ? (
            <View style={styles.headline}>
              <Text style={styles.headlineLabel}>{label}</Text>
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
    backgroundColor: theme.color.fillTertiary,
    overflow: 'hidden',
  },
  rowBar: {
    height: ROW_BAR_HEIGHT,
    borderRadius: ROW_BAR_HEIGHT / 2,
  },
  // 주간 청취 카드 안의 구획 — 면·둥근 모서리는 부모 카드가 갖는다. 위 차트와는 여백으로만 가른다
  embeddedContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl,
  },
  embeddedBody: {
    gap: theme.spacing.md,
  },
  embeddedEmptyBox: {
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
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
