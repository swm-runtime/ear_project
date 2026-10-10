import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { androidNavigationModeOf } from '@/shared/lib/android-navigation';
import { motion, theme } from '@/shared/theme';

/**
 * 끌어서 닫을 때 이어받는 속도의 상한(progress/초). 손가락을 세게 던져도 이보다 빠르게 닫지 않는다 —
 * 8 이면 남은 거리를 최소 0.125초에 지난다
 */
const CLOSE_VELOCITY_MAX = 8;
/** 끌기로 인정하는 최소 이동 — 이보다 작으면 탭이다 */
const DRAG_START_SLOP = 6;
/** 끌어 닫기 임계 — 높이의 1/4(최소 80pt)이거나 던진 속도 0.8 이상 */
const DRAG_CLOSE_RATIO = 0.25;
const DRAG_CLOSE_MIN = 80;
const DRAG_CLOSE_VELOCITY = 0.8;

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
 * - **아래로 끌어 닫는다**(PM 2026-09-27 19:55) — 손가락을 따라 내려가고 딤도 같이 밝아진다(애플 시트). 임계를
 *   넘겨 놓으면 닫히고, 아니면 제자리로 돌아온다. 끌기는 `progress` 를 직접 움직이므로 놓는 순간의 값에서
 *   이어서 닫혀 튐이 없다.
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
  /*
   * Android **버튼 내비게이션 바**(3버튼·2버튼, ~48dp)는 시트 아래를 덮는다 — 시트마다 바닥 여백(xl 32)은 iOS 홈 인디케이터·
   * Android 제스처 바(16~24dp)엔 맞지만 버튼 바엔 모자라 마지막 버튼이 가려졌다(PM 2026-10-10). 그 기기만 바 높이만큼 시트
   * 면을 늘린다(면 색이 바 밑까지 이어진다). 제스처 바·iOS 는 그대로
   */
  const insets = useSafeAreaInsets();
  const buttonBarInset =
    Platform.OS === 'android' && androidNavigationModeOf(insets.bottom) === 'buttons'
      ? insets.bottom
      : 0;
  /** 0 = 닫힘(화면 밖·딤 투명) · 1 = 열림. 끌 때도 이 값을 직접 움직인다 */
  const progress = useAnimatedValue(0);
  /** 제스처 콜백이 최신 값을 읽게 하는 ref — 갱신은 렌더 밖(effect)에서 한다 */
  const heightRef = useRef(0);
  const closeRef = useRef(onRequestClose);
  /**
   * 끌어서 닫을 때 손가락 속도(progress/초, 음수). 놓는 순간 적어 두고 나가는 애니메이션이 이어받는다 —
   * 이게 없으면 놓은 지점에서 ease-in 으로 **새로 시작**해 한 번 멈칫한다(PM 2026-09-27 20:50 "끊기는 것 같다")
   */
  const closeVelocityRef = useRef(0);

  useEffect(() => {
    closeRef.current = onRequestClose;
  }, [onRequestClose]);

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
    const settle = ({ finished }: { finished: boolean }) => {
      // 모션이 끝나면 모달을 내린다 — `onClosed` 는 그 뒤 `Modal onDismiss` 가 부른다(위 prop 주석)
      if (finished) setIsMounted(false);
    };
    const flickVelocity = closeVelocityRef.current;
    closeVelocityRef.current = 0;
    if (flickVelocity < 0) {
      // 끌어서 닫은 경우 — 손가락 속도를 그대로 이어 스프링으로 내린다(남은 거리도 짧다)
      Animated.spring(progress, {
        toValue: 0,
        velocity: flickVelocity,
        useNativeDriver: true,
        ...motion.spring.smooth,
      }).start(settle);
      return;
    }
    // 딤 탭·버튼으로 닫은 경우 — 제자리에서 시작하므로 곡선으로 충분하다
    Animated.timing(progress, {
      toValue: 0,
      duration: motion.duration.normal,
      easing: motion.easing.easeInOut,
      useNativeDriver: true,
    }).start(settle);
  }, [isVisible, isMounted, height, progress]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const measured = Math.ceil(event.nativeEvent.layout.height);
    heightRef.current = measured;
    if (measured > 0 && measured !== height) setHeight(measured);
  };

  /**
   * 아래로 끌어 닫기 — 시트 어디서든(맨 위 손잡이 포함) 받는다. 시트 안에는 스크롤 목록이 없어 스크롤과
   * 다툴 일이 없다.
   *
   * 두 갈래로 잡는다(2026-09-27 20:39 — 이동 조건만으로는 실기기에서 전혀 안 걸렸다):
   *
   * 1. `onStartShouldSetPanResponder` — **손잡이·제목·여백처럼 버튼이 아닌 자리**에서는 손을 대는 순간
   *    시트가 responder 가 된다. 이게 없으면 그 자리는 아무도 responder 를 잡지 않아 이동 이벤트가 오지 않았다
   *    (bubble 은 깊은 자식부터 묻기 때문에 버튼 위에서는 여전히 자식이 먼저 잡는다 — 탭은 그대로다).
   * 2. `onMoveShouldSetPanResponderCapture` — **버튼 위에서 끌기 시작한 경우.** 자식이 이미 responder 라
   *    조상이 빼앗으려면 capture 변형이어야 한다. 조건이 "아래로 6pt 이상 + 세로가 가로보다 큼"이라 탭은 안 훔친다.
   *
   * `PanResponder.create` 는 `useMemo` 로 고정한다 — 매 렌더 새로 만들면 제스처 도중 핸들러가 갈릴 수 있다.
   */
  const pan = useMemo(
    () =>
      // 룰은 "렌더 중 함수에 ref 를 넘긴다"를 잡는다 — 아래 콜백은 등록만 되고 실행은 제스처 시점이다
      // (표준 PanResponder 패턴, TopicMarqueeRow·MiniPlayer 와 같다)
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        // 버튼이 아닌 자리(손잡이·제목·여백)는 시작부터 시트가 받는다 — 위 1번
        onStartShouldSetPanResponder: () => true,
        // 버튼 위에서 시작한 끌기는 capture 로 빼앗는다 — 위 2번. 탭·좌우 스와이프는 훔치지 않는다
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          gesture.dy > DRAG_START_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          const sheetHeight = heightRef.current;
          if (sheetHeight <= 0) return;
          const next = 1 - Math.max(0, gesture.dy) / sheetHeight;
          progress.setValue(Math.max(0, Math.min(1, next)));
        },
        onPanResponderRelease: (_event, gesture) => {
          const sheetHeight = heightRef.current;
          // 높이의 1/4(최소 80pt)을 넘겼거나 빠르게 던졌으면 닫는다 — 아니면 제자리로
          const shouldClose =
            gesture.dy > Math.max(DRAG_CLOSE_MIN, sheetHeight * DRAG_CLOSE_RATIO) ||
            gesture.vy > DRAG_CLOSE_VELOCITY;
          if (shouldClose) {
            /*
             * 놓는 순간의 속도를 progress 단위로 바꿔 적어 둔다. `gesture.vy` 는 px/ms 이고 시트를 내리는
             * 방향이 양수이므로 progress/초 로는 `-vy * 1000 / 높이` 다. 나가는 애니메이션이 이어받는다
             */
            const perSecond = sheetHeight > 0 ? (-gesture.vy * 1000) / sheetHeight : 0;
            closeVelocityRef.current = Math.max(-CLOSE_VELOCITY_MAX, Math.min(-0.01, perSecond));
            // 닫기는 화면이 정한다 — `isVisible` 이 false 가 되면 위 effect 가 지금 값에서 이어서 내린다
            closeRef.current();
            return;
          }
          Animated.spring(progress, {
            toValue: 1,
            useNativeDriver: true,
            ...motion.spring.smooth,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(progress, {
            toValue: 1,
            useNativeDriver: true,
            ...motion.spring.smooth,
          }).start();
        },
      }),
    [progress],
  );

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
      {/*
        `pointerEvents="box-none"` 를 두지 않는다 — 그 값은 **이 View 자체가 터치 대상이 되지 않게** 해서
        아래 끌기 제스처가 영영 걸리지 않았다(2026-09-27 20:10 실기기). 이 상자는 시트 높이만큼만 차지하고
        딤은 형제라, 통과시킬 것이 없어 애초에 필요 없었다
      */}
      <Animated.View
        style={[styles.sheetWrap, { transform: [{ translateY }] }]}
        onLayout={handleLayout}
        {...pan.panHandlers}
      >
        <Animated.View style={sheetStyle}>
          {children}
          {buttonBarInset > 0 ? <View style={{ height: buttonBarInset }} /> : null}
        </Animated.View>
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
