import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useId, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { useNoticeDockStore } from '@/shared/ui/notice-dock.store';

/**
 * iOS 시스템 탭은 BottomTabBarHeightContext를 제공하지 않는다. 이미 바이너리에 있는 RNSSafeAreaView로
 * UIKit의 탭·액세서리 안전영역을 읽는다. 비어 있는 측정 뷰라 화면·스크롤·터치에는 관여하지 않는다.
 */
export default function NativeNoticeDock() {
  const focused = useIsFocused();
  const owner = useId();
  const ref = useRef<View>(null);
  const generation = useRef(0);
  const { height: windowHeight } = useWindowDimensions();
  const measure = useCallback(() => {
    if (!focused) return;
    const request = ++generation.current;
    ref.current?.measureInWindow((_x, y, _width, height) => {
      if (request === generation.current && height > 0)
        useNoticeDockStore.getState().set(owner, Math.max(0, windowHeight - y - height) + 8);
    });
  }, [focused, owner, windowHeight]);
  useEffect(() => {
    // 포커스·창 크기가 바뀔 때 시스템 안전영역 실측과 안내 위치를 동기화한다.
    measure();
    return () => {
      generation.current += 1;
      useNoticeDockStore.getState().set(owner, null);
    };
  }, [measure, owner]);
  return (
    <SafeAreaView
      style={StyleSheet.absoluteFill}
      edges={{ bottom: true }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View ref={ref} style={styles.fill} onLayout={measure} collapsable={false} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
