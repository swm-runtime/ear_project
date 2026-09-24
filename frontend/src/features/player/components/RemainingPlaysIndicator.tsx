import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
import { theme } from '@/shared/theme';
import GlassCapsule from '@/shared/ui/GlassCapsule';

import { PLAYER_COPY } from '../player.copy';

/** 링 지름 — 검색 박스 높이 안에 들어오면서 두 자리 숫자가 읽히는 크기 */
const RING_SIZE = 28;
/** 링을 담는 유리 원 — 라이브러리 필터 원(36)과 같은 크기·재질(2026-09-24 PM "리퀴드 글라스 처리") */
const RING_CAPSULE_SIZE = 36;
/** 링 두께 — 숫자를 가리지 않으면서 채움·비움이 갈릴 만큼 */
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface RemainingPlaysIndicatorProps {
  remaining: number;
  limit: number;
  /** 소진 상태에서만 탭 → 페이월(library-uiux.md 4.3). N > 0이면 탭 대상이 아니다 */
  onExhaustedPress: () => void;
}

/**
 * 잔여 재생 표시. 무제한·캐시·값 없음이면 부모가 렌더하지 않는다 — 자리를 비운다.
 *
 * **링 + 숫자**(2026-09-22 PM — 점 게이지에서 교체, `docs/changes/pending/remaining-plays-dot-gauge.md`).
 * 가운데 숫자가 남은 횟수, 둘레의 원호가 `남은/한도` 비율이다 — 숫자는 정확한 값을, 원호는 "얼마나 남았나"를
 * 한눈에 준다. 점은 한도가 5를 넘으면 세기 어려워 문자열로 돌아가야 했는데 링은 한도와 무관하다.
 * 소진이면 원호가 비고 숫자 0 이 주의색(paywall.md 5장). 낭독기 라벨은 그대로 "오늘 재생 M회 중 N회 남음".
 * 원호는 12시에서 시작해 시계 방향으로 채운다(iOS 활동 링·타이머와 같은 방향).
 */
export default function RemainingPlaysIndicator({
  remaining,
  limit,
  onExhaustedPress,
}: RemainingPlaysIndicatorProps) {
  const isExhausted = remaining === 0;
  const ratio = limit > 0 ? Math.max(0, Math.min(1, remaining / limit)) : 0;
  // 채운 길이만 보이게 — 나머지는 빈 간격(dasharray)으로 둔다
  const dashOffset = RING_CIRCUMFERENCE * (1 - ratio);

  const gauge = (
    <GlassCapsule style={styles.ringCapsule}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={isExhausted ? theme.color.danger : theme.color.border}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {ratio > 0 ? (
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={theme.color.textPrimary}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            fill="none"
            // 원호의 시작점을 3시에서 12시로 돌린다
            rotation={-90}
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        ) : null}
      </Svg>
      <View style={styles.countBox} pointerEvents="none">
        <Text style={[styles.count, isExhausted && styles.countExhausted]}>{remaining}</Text>
      </View>
    </GlassCapsule>
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
    // 검색 박스 옆에서 링이 너무 붙지 않게 — 칩 배경은 두지 않는다
    paddingHorizontal: theme.spacing.xs,
  },
  ringCapsule: {
    width: RING_CAPSULE_SIZE,
    height: RING_CAPSULE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.color.textPrimary,
    fontVariant: ['tabular-nums'],
    // 글자 상자의 위아래 여백을 없애 링 정중앙에 놓는다
    lineHeight: 13,
  },
  countExhausted: {
    color: theme.color.danger,
  },
  // 소진 상태만 눌린다 — 히트 영역을 44pt로 채운다(uiux 7)
  exhaustedButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
  },
});
