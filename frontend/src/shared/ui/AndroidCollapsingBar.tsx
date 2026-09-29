import { BlurView } from 'expo-blur';
import { useMemo, type ReactNode, type RefObject } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import { LARGE_TITLE_ROW_HEIGHT } from '@/shared/ui/LargeTitleRow';

interface AndroidCollapsingBarProps {
  /** 가운데 작은 제목 — 콘텐츠 첫 줄의 큰 제목(LargeTitleRow)이 밀려 올라가면 나타난다 */
  title: string;
  /** 목록의 contentOffset.y(useFloatingHeaderScroll 의 것) — 정지 오프셋 0 */
  scrollY: Animated.Value;
  /** 오른쪽 고정 컨트롤(잔여 링 등) — 큰 제목 줄과 같은 줄 높이에 앉는다 */
  trailing?: ReactNode;
  /** 서리 유리가 흐릴 대상(AndroidBlurTarget 로 감싼 목록) — 이 바는 반드시 그 뒤에 선언한다 */
  blurTarget: RefObject<View | null>;
}

/** 설정 상단바(SettingsScreen)와 같은 서리 유리 — 블러 25(Android ÷4 반경) + 흰 12% */
const FROST_BLUR_INTENSITY = 25;

/**
 * **Android 의 iOS 식 접힘 바**(PM 2026-09-29 17:19 "탐색 내리면 제목이 가운데 새로 생기고, 검색바·주제 알약은 제자리에서
 * 스크롤 — iOS 처럼 똑같이"). iOS 26 `.inline` 큰 제목 바를 흉내낸다:
 * - 바 줄(상태 바 밑 52 = 큰 제목 줄 높이)은 늘 떠 있고, 오른쪽 컨트롤만 고정으로 둔다.
 * - 큰 제목·검색창·칩은 **목록의 첫 줄**로 같이 스크롤한다. 정지 땐 큰 제목이 이 바 줄 자리에 앉아 한 줄로 보인다.
 * - 큰 제목이 절반쯤 밀려 올라가면 가운데 작은 제목(20, iOS 접힌 제목)과 서리 유리 판 + 아래 선이 함께 나타난다.
 * 목록은 contentContainer paddingTop = 상태 바 높이만 비운다
 */
export default function AndroidCollapsingBar({
  title,
  scrollY,
  trailing,
  blurTarget,
}: AndroidCollapsingBarProps) {
  const insets = useSafeAreaInsets();
  const collapse = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [LARGE_TITLE_ROW_HEIGHT * 0.5, LARGE_TITLE_ROW_HEIGHT],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: collapse }]} pointerEvents="none">
        <BlurView
          style={StyleSheet.absoluteFill}
          tint="light"
          intensity={FROST_BLUR_INTENSITY}
          blurTarget={blurTarget}
          blurMethod="dimezisBlurView"
        />
        <View style={[StyleSheet.absoluteFill, styles.frostWhite]} />
        <View style={styles.edge} />
      </Animated.View>
      <View style={styles.row} pointerEvents="box-none">
        <Animated.Text
          style={[styles.title, { opacity: collapse }]}
          numberOfLines={1}
          importantForAccessibility="no"
          pointerEvents="none"
        >
          {title}
        </Animated.Text>
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  frostWhite: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 60, 67, 0.2)',
  },
  // 큰 제목 줄(LargeTitleRow)과 같은 높이·좌우 여백 — 정지 때 오른쪽 컨트롤이 큰 제목과 한 줄로 선다
  row: {
    height: LARGE_TITLE_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.md,
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: theme.font.size.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
