import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
import { theme } from '@/shared/theme';

import { PLAYER_COPY } from '../player.copy';

/** 점 하나의 지름 — 검색 박스 옆에서 글자(xs)보다 작게, 그래도 채움·비움이 구분되게 */
const DOT_SIZE = 8;
/** 점으로 그리는 최대 한도 — 이보다 크면 점이 줄이 되어 세기 어렵다. 숫자로 돌아간다 */
const MAX_DOTS = 5;

interface RemainingPlaysIndicatorProps {
  remaining: number;
  limit: number;
  /** 소진 상태에서만 탭 → 페이월(library-uiux.md 4.3). N > 0이면 탭 대상이 아니다 */
  onExhaustedPress: () => void;
}

/**
 * 잔여 재생 표시. 무제한·캐시·값 없음이면 부모가 렌더하지 않는다 — 자리를 비운다.
 *
 * 한도만큼 점을 찍고 남은 만큼 채운다(2026-09-18 PM, 4안 중 채택 — `docs/changes/pending/remaining-plays-dot-gauge.md`).
 * 헤드폰 아이콘 + "1/2" 칩은 검색 줄에서 낱개 부품처럼 튀었다. 점은 숫자를 읽지 않아도 "몇 개 중 몇 개"가
 * 한눈에 들어오고, 소진이면 빈 점만 남아 그 자체가 상태다. 낭독기 라벨은 그대로 "오늘 재생 M회 중 N회 남음".
 * 한도가 `MAX_DOTS`를 넘으면 점 대신 paywall.md 5장의 `N/M` 문자열로 돌아간다.
 */
export default function RemainingPlaysIndicator({
  remaining,
  limit,
  onExhaustedPress,
}: RemainingPlaysIndicatorProps) {
  const isExhausted = remaining === 0;
  const useDots = limit <= MAX_DOTS;

  const gauge = useDots ? (
    <View style={styles.dots}>
      {Array.from({ length: limit }, (_, index) => {
        const isFilled = index < remaining;
        return (
          <View
            key={index}
            style={[
              styles.dot,
              isFilled ? styles.dotFilled : styles.dotEmpty,
              isExhausted && styles.dotExhausted,
            ]}
          />
        );
      })}
    </View>
  ) : (
    <Text style={[styles.label, isExhausted && styles.labelExhausted]}>
      {PLAYER_COPY.remaining.label(remaining, limit)}
    </Text>
  );

  if (!isExhausted) {
    return (
      <View
        style={styles.row}
        accessibilityLabel={PLAYER_COPY.remaining.a11yLabel(remaining, limit)}
        accessibilityLiveRegion="polite"
      >
        {gauge}
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.row, styles.exhaustedButton]}
      onPress={onExhaustedPress}
      accessibilityRole="button"
      accessibilityLabel={
        IS_SUBSCRIPTION_UI_ENABLED
          ? PLAYER_COPY.remaining.a11yLabelExhaustedWithPaywall
          : PLAYER_COPY.remaining.a11yLabelExhausted
      }
    >
      {gauge}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    // 검색 박스 옆에서 점 묶음이 너무 붙지 않게 — 칩 배경은 두지 않는다
    paddingHorizontal: theme.spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DOT_SIZE * 0.75,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotFilled: {
    backgroundColor: theme.color.textPrimary,
  },
  // 빈 점은 테두리만 — 채운 점과 같은 크기라 "자리는 있는데 비었다"로 읽힌다
  dotEmpty: {
    borderWidth: 1.5,
    borderColor: theme.color.textSecondary,
  },
  // 소진 — 빈 점 전부를 주의색으로(paywall.md 5장: 소진 표시는 주의색)
  dotExhausted: {
    borderColor: theme.color.danger,
  },
  label: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  labelExhausted: {
    fontWeight: '700',
    color: theme.color.danger,
  },
  // 소진 상태만 눌린다 — 히트 영역을 44pt로 채운다(uiux 7)
  exhaustedButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
  },
});
