import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { PLAYER_COPY } from '../player.copy';
import { HeadphonesIcon } from './PlayerIcons';

/** 숫자 글자(xs)보다 조금 크게 — 12px에서는 헤드폰 형태가 뭉개진다 */
const ICON_SIZE = 15;

interface RemainingPlaysIndicatorProps {
  remaining: number;
  limit: number;
  /** 소진 상태에서만 탭 → 페이월(library-uiux.md 4.3). N > 0이면 탭 대상이 아니다 */
  onExhaustedPress: () => void;
}

/**
 * 앱바 잔여 재생 표시. 무제한·캐시·값 없음이면 부모가 렌더하지 않는다 — 자리를 비운다.
 * 문구는 paywall.md 5장과 같은 한 문자열만 쓴다.
 */
export default function RemainingPlaysIndicator({
  remaining,
  limit,
  onExhaustedPress,
}: RemainingPlaysIndicatorProps) {
  const isExhausted = remaining === 0;

  if (!isExhausted) {
    return (
      <View
        style={styles.row}
        accessibilityLabel={PLAYER_COPY.remaining.a11yLabel(remaining, limit)}
        accessibilityLiveRegion="polite"
      >
        {/* 아이콘은 장식이다 — 컨테이너 라벨이 "오늘 재생 N회 중 M회 남음"을 이미 읽는다(uiux 7) */}
        <HeadphonesIcon size={ICON_SIZE} color={theme.color.textSecondary} />
        <Text style={styles.label}>{PLAYER_COPY.remaining.label(remaining, limit)}</Text>
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.row, styles.exhaustedButton]}
      onPress={onExhaustedPress}
      accessibilityRole="button"
      accessibilityLabel={PLAYER_COPY.remaining.a11yLabelExhausted}
    >
      <HeadphonesIcon size={ICON_SIZE} color={theme.color.danger} />
      <Text style={styles.exhaustedLabel}>{PLAYER_COPY.remaining.label(0, limit)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 앱바 위의 낱글자가 아니라 하나의 상태 칩으로 읽히게 한다(2026-09-02)
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.surface,
  },
  label: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  // 소진 상태만 눌린다 — 히트 영역을 44pt로 채운다(uiux 7)
  exhaustedButton: {
    minHeight: theme.touchTarget.minHeight,
  },
  exhaustedLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.danger,
    fontVariant: ['tabular-nums'],
  },
});
