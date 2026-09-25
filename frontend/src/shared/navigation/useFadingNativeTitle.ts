import { useNavigation } from '@react-navigation/native';
import { createElement, useLayoutEffect, useMemo } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { theme } from '@/shared/theme';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';
import { LARGE_TITLE_ROW_HEIGHT } from '@/shared/ui/LargeTitleRow';

import { useNativeHeaderInset } from './useNativeHeaderInset';

/**
 * iOS 26 시스템 내비게이션 바의 **작은 제목을 스크롤에 따라 페이드인**시킨다 — 콘텐츠 안 큰 제목 줄(`LargeTitleRow`)이
 * 바 밑으로 들어가면 나타나고, 맨 위로 돌아오면 사라진다(애플 뮤직·앱스토어 탭 화면의 동작).
 *
 * 바의 제목은 React 요소(`headerTitle` 함수)라 네이티브 드라이버 불투명도로 움직인다. 옵션은 제목이 바뀔 때만 다시 건다.
 * 시스템 탭 바가 아닌 갈래(iOS 26 미만·Android)에서는 아무것도 하지 않는다.
 *
 * @param scrollY 목록의 contentOffset.y(useFloatingHeaderScroll 의 것). 정지 오프셋은 −바 높이(contentInsetAdjustment automatic)
 */
export const useFadingNativeTitle = (title: string, scrollY: Animated.Value): void => {
  const navigation = useNavigation();
  const headerHeight = useNativeHeaderInset();
  const opacity = useMemo(() => {
    const rest = -headerHeight;
    // 큰 제목 글자가 바 밑으로 절반쯤 들어갈 때 시작해 다 들어가면 끝난다
    return scrollY.interpolate({
      inputRange: [rest + LARGE_TITLE_ROW_HEIGHT * 0.5, rest + LARGE_TITLE_ROW_HEIGHT],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }, [scrollY, headerHeight]);

  useLayoutEffect(() => {
    if (!HAS_NATIVE_TAB_BAR) return;
    navigation.setOptions({
      headerTitle: () =>
        createElement(
          Animated.Text,
          { style: [styles.title, { opacity }], numberOfLines: 1 },
          title,
        ),
    } as object);
  }, [navigation, title, opacity]);
};

const styles = StyleSheet.create({
  // iOS 바 제목 — 17pt semibold
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
