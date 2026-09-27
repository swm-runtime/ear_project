import { useEffect } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

interface CollapsedBarTitleProps {
  title: string;
  fontSize: number;
}

/**
 * 접힌 시스템 바의 작은 제목 — 나타날 때 **아래에서 살짝 올라오며 페이드인**한다(PM 2026-09-28 04:15 "라이브러리·탐색도
 * 설정 글자 나오는 것처럼"). 설정은 UIKit 큰 제목 접힘이 작은 제목을 페이드로 넣는데, 라이브러리·탐색은 접힐 때 큰 제목
 * 모드를 끄는 방식(useSystemLargeTitle collapse)이라 제목이 툭 바뀌었다 — 그 페이드를 여기서 준다. 네이티브 드라이버
 */
export default function CollapsedBarTitle({ title, fontSize }: CollapsedBarTitleProps) {
  const appear = useAnimatedValue(0);
  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: motion.duration.normal,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [appear]);

  return (
    <Animated.Text
      style={[
        styles.title,
        {
          fontSize,
          opacity: appear,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
      numberOfLines={1}
      accessibilityRole="header"
    >
      {title}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  // iOS 바 제목 — semibold
  title: {
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
