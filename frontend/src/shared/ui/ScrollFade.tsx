import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { theme } from '@/shared/theme';

/** 페이드 높이 — 카드 한 장을 덮지 않을 만큼만 둔다 */
const FADE_HEIGHT = 32;

/**
 * 스크롤 목록과 고정 독(dock) 사이의 페이드.
 *
 * 목록이 버튼에 그대로 맞닿아 끝나면 마지막 카드와 버튼이 겹쳐 보이고,
 * 아래에 더 있는지 여기가 끝인지도 구분되지 않는다. 배경색이 투명에서
 * 불투명으로 흐르게 해 경계를 만든다.
 *
 * 목록 위에 얹히기만 하고 조작은 받지 않는다(`pointerEvents="none"`) — 가려진
 * 카드도 그대로 눌려야 한다. 장식이므로 낭독기에서도 제외한다.
 */
export default function ScrollFade() {
  /*
   * 폭은 실측한 숫자로 준다 — 네이티브 SVG 는 "100%" 를 퍼센트가 아니라 100 으로 받아 페이드가 왼쪽 100pt 에만
   * 그려진다(2026-09-19 아이폰 실기기에서 같은 패턴의 플레이어 그라데이션으로 확인). 웹은 퍼센트로 동작한다
   */
  const [width, setWidth] = useState(0);
  return (
    <View
      style={styles.fade}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Svg width={width} height={FADE_HEIGHT}>
        <Defs>
          <LinearGradient id="scrollFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.color.background} stopOpacity={0} />
            <Stop offset="1" stopColor={theme.color.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={FADE_HEIGHT} fill="url(#scrollFade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: FADE_HEIGHT,
  },
});
