import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useContext, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

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
/** 누르는 동안 알약 확대 — 캡슐 밖으로 살짝 넘칠 만큼(캡슐은 clip 하지 않는다) */
const PILL_LIFT_SCALE = 1.12;

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
  // 누르는 동안 알약이 살짝 커져 떠오른다(iOS 26 탭 바) — 놓으면 제자리 크기로
  const indicatorScale = useAnimatedValue(1);
  const liftPill = (isLifted: boolean) => {
    Animated.spring(indicatorScale, {
      toValue: isLifted ? PILL_LIFT_SCALE : 1,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start();
  };
  const maxX = (state.routes.length - 1) * ITEM_WIDTH;
  const isDraggingRef = useRef(false);
  // 알약이 마지막으로 향한 자리 — 네이티브 스프링이 끝난 뒤 JS 쪽 값은 낡아 있을 수 있어 직접 든다.
  // 끌기 중이 아닐 때 탭 상태가 바뀌면(탭·딥링크·복원) 그 칸으로 스냅한다
  const pillXRef = useRef(state.index * ITEM_WIDTH);
  useEffect(() => {
    if (isDraggingRef.current) return;
    const x = state.index * ITEM_WIDTH;
     
    pillXRef.current = x;
    Animated.spring(indicatorX, { toValue: x, ...motion.spring.snappy, useNativeDriver: true }).start();
  }, [indicatorX, state.index]);

  // 끌기 — 핸들러는 렌더가 아니라 제스처 시점에 실행되므로 최신 값은 ref 로 든다
  const latestRef = useRef({ routes: state.routes, index: state.index, navigation, maxX });
  useEffect(() => {
    latestRef.current = { routes: state.routes, index: state.index, navigation, maxX };
  });
  const dragOriginRef = useRef(0);
  const snapTo = (index: number) => {
     
    pillXRef.current = index * ITEM_WIDTH;
    Animated.spring(indicatorX, {
      toValue: index * ITEM_WIDTH,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start();
  };
  const selectTab = (target: number) => {
    const { routes, index, navigation: nav } = latestRef.current;
    snapTo(target);
    if (target === index) return;
    const pressEvent = nav.emit({
      type: 'tabPress',
      target: routes[target].key,
      canPreventDefault: true,
    });
    if (!pressEvent.defaultPrevented) nav.navigate(routes[target].name);
  };
  /*
   * 탭·끌기는 **칸 하나하나가** 받는다(2026-09-23). 캡슐(부모)에 두고 칸에서 빼앗거나 처음부터 캡슐이 잡는
   * 두 방식 모두 실기기에서 알약이 끌려오지 않았다 — 터치를 확실히 받는 건 손가락 아래의 칸이다
   * (미니플레이어 스와이프와 같은 패턴). 4pt 안 움직이고 놓으면 그 칸으로(탭), 움직였으면 알약이 손가락을
   * 따라오다 놓은 자리에서 가까운 칸에 스냅. 콜백은 제스처 시점에 실행되므로 최신 값은 latestRef 로 읽는다
   */
  const itemPans = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      state.routes.map((_, itemIndex) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => {
            isDraggingRef.current = false;
            liftPill(true);
            indicatorX.stopAnimation();
            dragOriginRef.current = pillXRef.current;
          },
          onPanResponderMove: (_, gesture) => {
            if (!isDraggingRef.current) {
              if (Math.abs(gesture.dx) <= DRAG_START_DISTANCE) return;
              isDraggingRef.current = true;
            }
            const { maxX: limit } = latestRef.current;
            const x = Math.max(0, Math.min(limit, dragOriginRef.current + gesture.dx));
            pillXRef.current = x;
            indicatorX.setValue(x);
          },
          onPanResponderRelease: (_, gesture) => {
            liftPill(false);
            const { maxX: limit } = latestRef.current;
            const target = isDraggingRef.current
              ? Math.round(Math.max(0, Math.min(limit, dragOriginRef.current + gesture.dx)) / ITEM_WIDTH)
              : itemIndex;
            isDraggingRef.current = false;
            selectTab(target);
          },
          onPanResponderTerminate: () => {
            liftPill(false);
            isDraggingRef.current = false;
            snapTo(latestRef.current.index);
          },
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 칸 수는 고정(3), indicatorX 는 고정 인스턴스
    [],
  );

  return (
    <View
      style={[styles.dock, { paddingBottom: insets.bottom + BOTTOM_GAP }]}
      pointerEvents="box-none"
      onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}
    >
      <View style={styles.capsule} accessibilityRole="tablist">
        <GlassSurface style={[StyleSheet.absoluteFill, styles.capsuleGlass]} />
        <View style={styles.capsuleBorder} pointerEvents="none" />
        <GlassPill
          style={[
            styles.indicator,
            { transform: [{ translateX: indicatorX }, { scale: indicatorScale }] },
          ]}
        />
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
          return (
            <View
              key={route.key}
              style={styles.item}
              accessible
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              // 낭독기 활성화 — 터치가 아니라 접근성 경로로 들어온다
              onAccessibilityTap={() => selectTab(index)}
              {...itemPans[index].panHandlers}
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
            </View>
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
    // clip 하지 않는다 — 누른 알약이 캡슐 밖으로 살짝 넘친다(iOS 26). 유리 바탕은 자기 반지름으로 잘린다
    // 유리 위의 하이라이트 대신 얇은 윤곽 — 밝은 목록 위에서 캡슐의 경계가 사라지지 않게
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.10)',
  },
  capsuleGlass: {
    borderRadius: theme.radius.full,
    overflow: 'hidden',
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
