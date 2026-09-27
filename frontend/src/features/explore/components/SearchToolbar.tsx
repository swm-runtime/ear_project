import { useEffect } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';
import CloseIcon from '@/shared/ui/CloseIcon';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

import { RemainingPlaysIndicator } from '@/features/player';

import { EXPLORE_COPY } from '../explore.copy';

interface SearchToolbarProps {
  /** null 이면 링 칸을 두지 않는다(무제한·캐시·값 없음 — uiux 4.3) — 그땐 닫기 원만 남는다 */
  remaining: { remaining: number; limit: number } | null;
  onExhaustedPress: () => void;
  onClose: () => void;
  /**
   * 닫기 칸이 펼쳐져 있는가 — 들어올 때 false → true 로 링 옆에서 **닫기 칸이 자라나며** 알약이 늘어나고(PM 2026-09-27 23:01
   * "알약도 애니메이션"), 나갈 때 true → false 로 줄어든다. 기본 true
   */
  isOpen?: boolean;
}

/**
 * 제자리 검색의 제목 줄 오른쪽 — 잔여 링 + 닫기(✕)를 **한 유리 캡슐**에 묶는다(PM 2026-09-27 22:53 "두 알약 합쳐").
 * 라이브러리 툴바(링 + 필터, LibraryToolbar)와 같은 문법 — 칸 44, 사이 hairline 구분선
 */
export default function SearchToolbar({
  remaining,
  onExhaustedPress,
  onClose,
  isOpen = true,
}: SearchToolbarProps) {
  // 닫기 칸의 폭 0 ↔ 44 — 들어올 때 링 옆에서 자라나고, 나갈 때 링 쪽으로 **줄어들며 합쳐진다**(PM 2026-09-27 23:27 "알약이
  // 합쳐지는 애니메이션"). 레이아웃이라 JS 드라이버 — 피드를 다시 그리지 않게 된 뒤(#849)라 닫힘에도 끊기지 않는다
  const open = useAnimatedValue(0);
  const fade = useAnimatedValue(0);
  useEffect(() => {
    Animated.spring(open, {
      toValue: isOpen ? 1 : 0,
      ...motion.spring.snappy,
      overshootClamping: true,
      useNativeDriver: false,
    }).start();
    Animated.timing(fade, {
      toValue: isOpen ? 1 : 0,
      duration: motion.duration.fast,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [isOpen, open, fade]);
  const closeWidth = open.interpolate({ inputRange: [0, 1], outputRange: [0, theme.touchTarget.minWidth] });

  return (
    <GlassCapsule style={styles.capsule}>
      {remaining ? (
        <>
          <View style={styles.cell}>
            <RemainingPlaysIndicator
              remaining={remaining.remaining}
              limit={remaining.limit}
              onExhaustedPress={onExhaustedPress}
              bare
            />
          </View>
          <Animated.View style={[styles.divider, { opacity: fade }]} pointerEvents="none" />
        </>
      ) : null}
      <Animated.View style={[styles.closeSlot, { width: remaining ? closeWidth : theme.touchTarget.minWidth }]}>
        <Animated.View style={{ opacity: fade }}>
          <Pressable
            style={styles.cell}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={EXPLORE_COPY.search.cancel}
          >
            <CloseIcon size={16} color={theme.color.textPrimary} />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </GlassCapsule>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_CONTROL_HEIGHT,
  },
  cell: {
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeSlot: {
    overflow: 'hidden',
    alignItems: 'flex-end',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: HEADER_CONTROL_HEIGHT - theme.spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
});
