import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { theme } from '@/shared/theme';

/** 페이드 높이 — 카드 한 장을 덮지 않을 만큼만 둔다 */
const FADE_HEIGHT = 32;

interface ScrollFadeProps {
  /**
   * 어느 가장자리에 붙는가. `bottom`(기본) = 목록과 고정 독 사이, 아래로 갈수록 배경색.
   * `top` = 고정 헤더와 목록 사이, 위로 갈수록 배경색 — 구분선 대신 쓴다(2026-09-18)
   */
  edge?: 'top' | 'bottom';
  /** 흘러 들어갈 배경색 — 기본은 앱 배경. 바탕색이 다른 화면(검정 플레이어)은 그 색을 준다 */
  color?: string;
}

/**
 * 스크롤 목록과 고정 영역(독·헤더) 사이의 페이드.
 *
 * 목록이 고정 영역에 그대로 맞닿아 끝나면 잘린 카드와 겹쳐 보이고, 더 있는지 여기가 끝인지도
 * 구분되지 않는다. 배경색이 투명에서 불투명으로 흐르게 해 경계를 만든다.
 *
 * 목록 위에 얹히기만 하고 조작은 받지 않는다(`pointerEvents="none"`) — 가려진
 * 카드도 그대로 눌려야 한다. 장식이므로 낭독기에서도 제외한다.
 */
export default function ScrollFade({
  edge = 'bottom',
  color = theme.color.background,
}: ScrollFadeProps) {
  const isTop = edge === 'top';
  // 그라데이션 id 는 문서 안에서 유일해야 한다 — 방향·색이 다른 것들이 한 화면(웹 문서)에 있을 수 있다
  const gradientId = `scrollFade${isTop ? 'Top' : 'Bottom'}${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      style={[styles.fade, isTop ? styles.top : styles.bottom]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Svg width="100%" height={FADE_HEIGHT}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={isTop ? 1 : 0} />
            <Stop offset="1" stopColor={color} stopOpacity={isTop ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={FADE_HEIGHT} fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
  },
});
