import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useContext, useEffect } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';
import GlassSurface, { GlassPill } from '@/shared/ui/GlassSurface';
import TabBarIcon, { type TabBarIconName } from '@/shared/ui/TabBarIcon';

/** 캡슐 높이 — 아이콘 24 + 라벨 11 + 위아래 숨. iOS 26 탭 바와 같은 눈높이 */
const CAPSULE_HEIGHT = 60;
/** 캡슐 안쪽 여백 — 선택 알약이 캡슐 테두리에 붙지 않게 */
const CAPSULE_INSET = 4;
/** 칸 폭 — 세 칸이 같은 폭이어야 선택 알약이 옮겨갈 때 크기가 안 변한다(PopularPeriodToggle 과 같은 이유) */
const ITEM_WIDTH = 96;
const ITEM_HEIGHT = CAPSULE_HEIGHT - CAPSULE_INSET * 2;
/** 홈 인디케이터(안전영역)와 캡슐 사이 */
const BOTTOM_GAP = 10;
const ICON_SIZE = 24;
const LABEL_SIZE = 11;

const ICON_NAMES: Record<string, TabBarIconName> = {
  Library: 'library',
  Explore: 'explore',
  Profile: 'profile',
};

/**
 * 하단 탭 바 — 화면 폭을 다 쓰는 띠가 아니라 **떠 있는 캡슐**(2026-09-23 PM — iOS 26 탭 바처럼).
 * 바탕은 GlassSurface(리퀴드 글라스 / 블러), 선택은 캡슐 안의 알약 하나가 스프링으로 옮겨가며 표시한다
 * (PopularPeriodToggle 과 같은 문법). 색만이 아니라 알약·아이콘 채움으로도 갈린다(uiux 7).
 *
 * 차지하는 높이(안전영역 + 간격 + 캡슐)는 BottomTabBarHeightCallbackContext 로 올린다 — 미니플레이어가 그 위에
 * 서고 목록이 그만큼 바닥 여백을 둔다(useBottomDockInset)
 */
export default function CapsuleTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const indicatorX = useAnimatedValue(state.index * ITEM_WIDTH);
  useEffect(() => {
    Animated.spring(indicatorX, {
      toValue: state.index * ITEM_WIDTH,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start();
  }, [indicatorX, state.index]);

  return (
    <View
      style={[styles.dock, { paddingBottom: insets.bottom + BOTTOM_GAP }]}
      pointerEvents="box-none"
      onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}
    >
      <View style={styles.capsule} accessibilityRole="tablist">
        <GlassSurface style={StyleSheet.absoluteFill} />
        <View style={styles.capsuleBorder} pointerEvents="none" />
        <GlassPill style={[styles.indicator, { transform: [{ translateX: indicatorX }] }]} />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const color = isFocused ? theme.color.primary : theme.color.textSecondary;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              style={styles.item}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            >
              <TabBarIcon
                name={ICON_NAMES[route.name] ?? 'library'}
                color={color}
                focused={isFocused}
                size={ICON_SIZE}
              />
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  capsule: {
    flexDirection: 'row',
    height: CAPSULE_HEIGHT,
    padding: CAPSULE_INSET,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    // 유리 위의 하이라이트 대신 얇은 윤곽 — 밝은 목록 위에서 캡슐의 경계가 사라지지 않게
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.10)',
  },
  capsuleBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.10)',
  },
  // 선택 알약 — 유리 렌즈(GlassPill). 첫 칸 자리에 두고 translateX 로 옮긴다. 색은 GlassPill 이 정한다
  indicator: {
    position: 'absolute',
    top: CAPSULE_INSET,
    left: CAPSULE_INSET,
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    borderRadius: theme.radius.full,
  },
  item: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: LABEL_SIZE,
    fontWeight: '600',
  },
});
