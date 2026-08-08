import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { theme } from '@/shared/theme';

import { PROFILE_COPY } from '../profile.copy';
import type { TopicDistribution } from '../profile.types';

interface TopicDonutProps {
  distribution: TopicDistribution;
}

const DONUT_SIZE = 140;
const DONUT_STROKE = 26;
const RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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

/**
 * 주제 분포 — 도넛 + 범례(profile-uiux.md 4.6). 상위 5개 + "기타"를 서버 비율 그대로 그린다
 * (합 100 조정까지 서버 몫 — 재정규화 금지). 절대값(시간)을 표시하지 않는다.
 * 원형 그래프 자체는 장식이고 범례가 곧 대체 텍스트다(7장) — 색만으로 조각을 구분하지 않는다.
 */
export default function TopicDonut({ distribution }: TopicDonutProps) {
  const entries = toLegendEntries(distribution);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{PROFILE_COPY.stats.distributionTitle}</Text>
      {entries.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{PROFILE_COPY.stats.emptyState}</Text>
        </View>
      ) : (
        <View style={styles.chartRow}>
          <View
            // iOS·Android 양쪽에서 장식 처리한다 — 실기기 확인 항목(스크린리더 노출 방식이 갈릴 수 있다)
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
              {
                entries.reduce<{ elements: ReactElement[]; offsetRatio: number }>(
                  (acc, entry) => {
                    const length = (entry.ratio / 100) * CIRCUMFERENCE;
                    acc.elements.push(
                      <Circle
                        key={entry.key}
                        cx={DONUT_SIZE / 2}
                        cy={DONUT_SIZE / 2}
                        r={RADIUS}
                        fill="none"
                        stroke={entry.color}
                        strokeWidth={DONUT_STROKE}
                        strokeDasharray={`${length} ${CIRCUMFERENCE}`}
                        strokeDashoffset={-(acc.offsetRatio / 100) * CIRCUMFERENCE}
                        // 12시 방향에서 시작한다
                        transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
                      />,
                    );
                    acc.offsetRatio += entry.ratio;
                    return acc;
                  },
                  { elements: [], offsetRatio: 0 },
                ).elements
              }
            </Svg>
          </View>
          <View
            style={styles.legend}
            accessible
            // 범례가 곧 대체 텍스트 — "커리어 38%, …, 기타 6%" 순서로 읽힌다(profile-uiux.md 7장)
            accessibilityLabel={PROFILE_COPY.stats.legendA11y(entries)}
          >
            {entries.map((entry) => (
              <View key={entry.key} style={styles.legendRow}>
                <View style={[styles.swatch, { backgroundColor: entry.color }]} />
                <Text style={styles.legendName}>{entry.name}</Text>
                <Text style={styles.legendRatio}>{PROFILE_COPY.stats.ratioValue(entry.ratio)}</Text>
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
  emptyBox: {
    height: DONUT_SIZE,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    flexWrap: 'wrap',
  },
  legend: {
    flex: 1,
    minWidth: 140,
    gap: theme.spacing.xs,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  legendName: {
    flex: 1,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  legendRatio: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
