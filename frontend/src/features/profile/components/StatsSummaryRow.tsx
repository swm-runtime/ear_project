import { PixelRatio, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { PROFILE_COPY } from '../profile.copy';
import type { StatsSummary } from '../profile.types';

interface StatsSummaryRowProps {
  summary: StatsSummary;
}

/** 세로 스택 전환 임계 — 200% 대응 규칙(profile-uiux.md 7장)의 적용값. 실기기 검증 후 조정한다 */
const STACKED_FONT_SCALE = 1.5;

interface TileProps {
  label: string;
  value: string;
  stacked: boolean;
  wide?: boolean;
}

function Tile({ label, value, stacked, wide = false }: TileProps) {
  return (
    // 값과 라벨을 한 문장으로 읽는다 — "누적 청취 128편"(profile-uiux.md 7장)
    <View
      style={[styles.tile, wide && styles.timeTile, stacked && styles.tileStacked]}
      accessible
      accessibilityLabel={PROFILE_COPY.stats.tileA11y(label, value)}
    >
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function Divider({ stacked }: { stacked: boolean }) {
  return <View style={[styles.divider, stacked && styles.dividerStacked]} accessible={false} />;
}

/**
 * 통계 요약 — 카드 하나 안에 누적 3지표 가로 3분할(profile-uiux.md 4.6). 표시 전용(탭 없음).
 * 값은 서버 계산 그대로다: 연속 일수는 오늘 안 들었어도 어제까지의 값을 그대로 표시하고
 * ("오늘 안 들었으니 0" 재판정 금지), 시간은 버림 표기다(반올림 금지).
 * 기록이 없으면 "0편"·"0분"·"0일" — 자리를 비우거나 "-"로 두지 않는다(P10 변형 A).
 */
export default function StatsSummaryRow({ summary }: StatsSummaryRowProps) {
  const isStacked = PixelRatio.getFontScale() >= STACKED_FONT_SCALE;
  return (
    <View style={styles.card}>
      <View style={[styles.row, isStacked && styles.rowStacked]}>
        <Tile
          label={PROFILE_COPY.stats.labels.completed}
          value={PROFILE_COPY.stats.completedValue(summary.completedContentCount)}
          stacked={isStacked}
        />
        <Divider stacked={isStacked} />
        <Tile
          label={PROFILE_COPY.stats.labels.listened}
          value={PROFILE_COPY.stats.listenedValue(summary.totalListenedSec)}
          stacked={isStacked}
          wide
        />
        <Divider stacked={isStacked} />
        <Tile
          label={PROFILE_COPY.stats.labels.streak}
          value={PROFILE_COPY.stats.streakValue(summary.streakDays)}
          stacked={isStacked}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
  },
  // 위아래 16 — 24 였을 땐 두 줄(숫자·라벨) 내용에 비해 카드가 두꺼워 위 묶음 카드보다 1.5배 넓어 보였다(PM 2026-10-11)
  row: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  rowStacked: {
    flexDirection: 'column',
  },
  tile: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing.xs,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  timeTile: {
    flex: 1.2,
  },
  tileStacked: {
    flex: 0,
    paddingVertical: theme.spacing.xs,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: theme.font.size.xl,
    alignSelf: 'center',
    backgroundColor: theme.color.border,
  },
  dividerStacked: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    marginVertical: theme.spacing.sm,
  },
  value: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  label: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
});
