import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useContext, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

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

/** 이만큼 가로로 움직이면 탭이 아니라 알약 끌기다 */
const DRAG_START_DISTANCE = 4;

/**
 * 하단 탭 바 — 화면 폭을 다 쓰는 띠가 아니라 **떠 있는 캡슐**(2026-09-23 PM — iOS 26 탭 바처럼).
 * 바탕은 GlassSurface(리퀴드 글라스 / 블러), 선택은 캡슐 안의 알약 하나가 스프링으로 옮겨가며 표시한다
 * (PopularPeriodToggle 과 같은 문법). 색만이 아니라 알약·아이콘 채움으로도 갈린다(uiux 7).
 *
 * - 아이콘 채움·라벨 색은 **알약이 그 칸에 겹친 만큼** 바뀐다(선·회색 위에 면·검정을 겹쳐 불투명도로) — 알약과
 *   따로 즉시 바뀌면 둘이 어긋나 보였다(2026-09-23 PM).
 * - 알약은 **잡고 끌 수 있다**(iOS 26 탭 바) — 손가락을 따라오다 놓으면 가까운 칸에 스냅하고 그 탭으로 간다.
 *   탭은 그대로 탭이다(가로로 4pt 넘게 움직여야 끌기).
 *
 * 차지하는 높이(안전영역 + 간격 + 캡슐)는 BottomTabBarHeightCallbackContext 로 올린다 — 미니플레이어가 그 위에
 * 서고 목록이 그만큼 바닥 여백을 둔다(useBottomDockInset)
 */
export default function CapsuleTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const indicatorX = useAnimatedValue(state.index * ITEM_WIDTH);
  const maxX = (state.routes.length - 1) * ITEM_WIDTH;
  const isDraggingRef = useRef(false);
  useEffect(() => {
    if (isDraggingRef.current) return;
    Animated.spring(indicatorX, {
      toValue: state.index * ITEM_WIDTH,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start();
  }, [indicatorX, state.index]);

  // 끌기 — 핸들러는 렌더가 아니라 제스처 시점에 실행되므로 최신 값은 ref 로 든다
  const latestRef = useRef({ routes: state.routes, index: state.index, navigation, maxX });
  useEffect(() => {
    latestRef.current = { routes: state.routes, index: state.index, navigation, maxX };
  });
  const dragOriginRef = useRef(0);
  // 캡슐의 화면 x — 탭 위치를 칸 번호로 바꿀 때 쓴다(dock 이 화면 폭 전체라 dock 기준 x 가 곧 화면 x)
  const capsuleLeftRef = useRef(0);
  const snapTo = (index: number) => {
    Animated.spring(indicatorX, {
      toValue: index * ITEM_WIDTH,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start();
  };
  const dragPan = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        /*
         * 캡슐이 **터치 시작부터** 응답자다(capture). 칸(Pressable)이 먼저 잡게 두고 이동 중에 빼앗아 오는
         * 협상은 실기기에서 성립하지 않았다(2026-09-23 — 알약이 끌려오지 않았다). 탭·끌기를 여기서 다 가른다:
         * 4pt 안 움직이고 놓으면 손가락 위치의 칸으로(탭), 움직였으면 알약이 따라오다 놓은 자리에서 스냅(끌기).
         * 칸의 Pressable 은 낭독기 활성화용으로만 남는다
         */
        onStartShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          isDraggingRef.current = false;
          indicatorX.stopAnimation((value) => {
            dragOriginRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          if (!isDraggingRef.current) {
            if (Math.abs(gesture.dx) <= DRAG_START_DISTANCE) return;
            isDraggingRef.current = true;
          }
          const { maxX: limit } = latestRef.current;
          indicatorX.setValue(Math.max(0, Math.min(limit, dragOriginRef.current + gesture.dx)));
        },
        onPanResponderRelease: (event, gesture) => {
          const { routes, index, navigation: nav, maxX: limit } = latestRef.current;
          let target: number;
          if (isDraggingRef.current) {
            const x = Math.max(0, Math.min(limit, dragOriginRef.current + gesture.dx));
            target = Math.round(x / ITEM_WIDTH);
          } else {
            // 탭 — 손가락이 놓인 칸
            const local = event.nativeEvent.pageX - capsuleLeftRef.current - CAPSULE_INSET;
            target = Math.max(0, Math.min(routes.length - 1, Math.floor(local / ITEM_WIDTH)));
          }
          isDraggingRef.current = false;
          snapTo(target);
          if (target !== index) {
            const pressEvent = nav.emit({
              type: 'tabPress',
              target: routes[target].key,
              canPreventDefault: true,
            });
            if (!pressEvent.defaultPrevented) nav.navigate(routes[target].name);
          }
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          snapTo(latestRef.current.index);
        },
        // 목록 스크롤 등이 가져가려 해도 내주지 않는다 — 캡슐 위의 손가락은 캡슐의 것이다
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- indicatorX 는 고정 인스턴스
    [],
  );

  return (
    <View
      style={[styles.dock, { paddingBottom: insets.bottom + BOTTOM_GAP }]}
      pointerEvents="box-none"
      onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}
    >
      <View
        style={styles.capsule}
        accessibilityRole="tablist"
        onLayout={(event) => {
          capsuleLeftRef.current = event.nativeEvent.layout.x;
        }}
        {...dragPan.panHandlers}
      >
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
          // 알약이 이 칸에 겹친 비율(0~1) — 채운 아이콘·검정 라벨의 불투명도
          const selectedOpacity = indicatorX.interpolate({
            inputRange: [(index - 1) * ITEM_WIDTH, index * ITEM_WIDTH, (index + 1) * ITEM_WIDTH],
            outputRange: [0, 1, 0],
            extrapolate: 'clamp',
          });
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
              {/* 두 겹 — 선·회색(항상) 위에 면·검정(알약이 겹친 만큼) */}
              <View style={styles.glyph}>
                <TabBarIcon
                  name={ICON_NAMES[route.name] ?? 'library'}
                  color={theme.color.textSecondary}
                  focused={false}
                  size={ICON_SIZE}
                />
                <Animated.View style={[styles.glyphOverlay, { opacity: selectedOpacity }]}>
                  <TabBarIcon
                    name={ICON_NAMES[route.name] ?? 'library'}
                    color={theme.color.primary}
                    focused
                    size={ICON_SIZE}
                  />
                </Animated.View>
              </View>
              <View>
                <Text style={styles.label} numberOfLines={1}>
                  {label}
                </Text>
                <Animated.Text
                  style={[styles.label, styles.labelSelected, { opacity: selectedOpacity }]}
                  numberOfLines={1}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                >
                  {label}
                </Animated.Text>
              </View>
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
  glyph: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  glyphOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  label: {
    fontSize: LABEL_SIZE,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  labelSelected: {
    position: 'absolute',
    top: 0,
    left: 0,
    color: theme.color.primary,
  },
});
