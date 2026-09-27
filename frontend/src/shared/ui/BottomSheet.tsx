import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

interface BottomSheetProps {
  isVisible: boolean;
  /** 딤 탭·안드로이드 뒤로가기 — 화면이 닫기를 결정한다 */
  onRequestClose: () => void;
  /**
   * 모달이 **실제로 내려간 뒤** 호출된다 — 종전 `Modal onDismiss` 를 그대로 물려 준다(iOS 전용).
   * 더보기 시트의 공유가 이 순서에 매달려 있다: iOS 는 모달이 dismiss 되는 동안 새 시스템 시트 present 를
   * 무시하므로 공유는 닫힘이 끝난 뒤에 열어야 한다(`useDeferredSheetShare`). 그래서 나가는 모션이 끝나는
   * 시점이 아니라 **모달 언마운트 완료**에 걸어 둔다
   */
  onClosed?: () => void;
  /** 시트 면 — 바탕색·모서리·패딩은 각 화면이 준다(플레이어 시트는 어두운 팔레트) */
  sheetStyle?: StyleProp<ViewStyle>;
  /** 딤 색 — 기본은 `color.overlay`. 플레이어 시트는 자기 팔레트의 딤을 넘긴다 */
  dimColor?: string;
  children: ReactNode;
}

/**
 * 아래에서 올라오는 시트의 공용 껍데기 — 더보기·필터·배속·수면 타이머가 모두 이걸 쓴다.
 *
 * **RN `Modal` 의 `animationType="slide"` 를 쓰지 않는다**(PM 2026-09-27 19:41 "아래에서 뜨는 모달 애니메이션이
 * 부자연스럽다"). 그 값은 **딤까지 통째로 밑에서 밀어 올려서** 어두운 사각형이 시트와 함께 솟아오른다 — 애플은
 * 딤이 제자리에서 페이드되고 시트만 올라온다. 곡선도 RN 고정값이라 `motion` 토큰과 어긋났다.
 *
 * - 들어올 때: 시트는 `spring.smooth`(SwiftUI `.smooth`)로 자기 높이만큼 올라오고, 딤은 같은 진행도로 페이드된다.
 * - 나갈 때: `duration.normal` + `easeInOut` 으로 되돌린 **뒤** 모달을 내린다 — `isVisible` 이 false 가 되는
 *   순간 언마운트하면 나가는 모션이 안 보인다. 그래서 내부에 `isMounted` 를 따로 둔다.
 * - 높이를 재기 전에는 화면 밖(창 높이)에 두고 시작한다 — 첫 프레임에 제자리로 찍히는 번쩍임을 막는다.
 */
export default function BottomSheet({
  isVisible,
  onRequestClose,
  onClosed,
  sheetStyle,
  dimColor = theme.color.overlay,
  children,
}: BottomSheetProps) {
  const [isMounted, setIsMounted] = useState(isVisible);
  const [height, setHeight] = useState(0);
  /** 0 = 닫힘(화면 밖·딤 투명) · 1 = 열림 */
  const progress = useAnimatedValue(0);

  // 열리는 순간 **렌더 중에** 붙인다(React 가 권하는 파생 상태 갱신) — effect 로 미루면 한 프레임 늦게 붙어
  // 첫 스프링이 잘린다. 닫는 쪽은 나가는 모션이 끝난 뒤라 아래 effect 가 맡는다
  if (isVisible && !isMounted) setIsMounted(true);

  useEffect(() => {
    if (!isMounted) return;
    if (isVisible) {
      // 높이를 재기 전에는 시작하지 않는다 — 어디서 올라올지 모르는 상태로 스프링을 걸면 튄다
      if (height === 0) return;
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: true,
        ...motion.spring.smooth,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: motion.duration.normal,
      easing: motion.easing.easeInOut,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // 모션이 끝나면 모달을 내린다 — `onClosed` 는 그 뒤 `Modal onDismiss` 가 부른다(위 prop 주석)
      if (finished) setIsMounted(false);
    });
  }, [isVisible, isMounted, height, progress]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const measured = Math.ceil(event.nativeEvent.layout.height);
    if (measured > 0 && measured !== height) setHeight(measured);
  };

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    // 재기 전엔 창 높이 — 어떤 시트보다 크므로 확실히 화면 밖이다
    outputRange: [height > 0 ? height : Dimensions.get('window').height, 0],
  });

  return (
    <Modal
      visible={isMounted}
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
      onDismiss={onClosed}
      statusBarTranslucent
    >
      <Animated.View style={[styles.dim, { backgroundColor: dimColor, opacity: progress }]}>
        {/* 딤 자체는 낭독 대상이 아니다(라벨 없는 버튼으로 읽히면 더 나쁘다) — 닫기는 시트 안의 동작·뒤로가기로 한다 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} accessible={false} />
      </Animated.View>
      <Animated.View
        style={[styles.sheetWrap, { transform: [{ translateY }] }]}
        onLayout={handleLayout}
        pointerEvents="box-none"
      >
        <Animated.View style={sheetStyle}>{children}</Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // 시트는 바닥에 붙는다 — 딤과 형제라 딤이 시트와 함께 움직이지 않는다
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
