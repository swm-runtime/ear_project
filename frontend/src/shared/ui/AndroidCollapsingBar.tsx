import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';
import { LARGE_TITLE_ROW_HEIGHT } from '@/shared/ui/LargeTitleRow';
import { AnimatedText } from '@/shared/ui/Typography';

interface AndroidCollapsingBarProps {
  /** 가운데 작은 제목 — 콘텐츠 첫 줄의 큰 제목(LargeTitleRow)이 밀려 올라가면 나타난다 */
  title: string;
  /** 목록의 contentOffset.y(useFloatingHeaderScroll 의 것) — 정지 오프셋 0 */
  scrollY: Animated.Value;
  /** 왼쪽 고정 컨트롤(뒤로 원 등) — 푸시 화면(설정)은 이 줄 밑에 큰 제목이 온다 */
  leading?: ReactNode;
  /** 오른쪽 고정 컨트롤(잔여 링 등) — 큰 제목 줄과 같은 줄 높이에 앉는다 */
  trailing?: ReactNode;
  /** 서리 유리가 흐릴 대상(AndroidBlurTarget 로 감싼 목록) — 이 바는 반드시 그 뒤에 선언한다 */
  blurTarget: RefObject<View | null>;
  /**
   * 작은 제목을 누르면 — 목록 맨 위로(PM 2026-09-30 04:53 "상단바 제목 터치하면 최상단으로"). iOS 상태 바 탭과 같은 역할.
   * 제목이 **보일 때만** 바 줄이 탭을 받는다 — 정지 땐 그 자리에 큰 제목 줄이 앉아 있어 가로채면 안 된다
   */
  onTitlePress?: () => void;
}

/** 블러 25(Android ÷4 반경) 위에 미니플레이어와 같은 밝은 틴트 72%를 얹는다. */
const FROST_BLUR_INTENSITY = 25;
/**
 * 상태 바 아이콘(시간·배터리) 높이 어림값 — 기기마다 달라 실측값이 아니다. 아이콘은 상태 바 가운데라 그 밑에
 * (상태 바 − 이 값) / 2 가 남는다
 */
// 16 → 22: 바 아래 여백을 3 줄인다(PM 2026-09-30 03:38 "조금만 줄이는 게 나을 것 같아")
const STATUS_ICON_HEIGHT = 22;
/** 작은 제목이 나타나는 경계 — 큰 제목 줄이 이만큼 밀려 올라가면 켜지고, 되돌아올 땐 SHOW_BELOW 밑에서 꺼진다(깜빡임 방지) */
const TITLE_SHOW_AT = LARGE_TITLE_ROW_HEIGHT * 0.75;
const TITLE_HIDE_BELOW = LARGE_TITLE_ROW_HEIGHT * 0.5;
/** 작은 제목이 올라오는 거리 */
const TITLE_RISE = 6;
/**
 * 제목 탭 뒤 재확인 시점(ms) — 이때도 맨 위가 아니면 한 번 더 올린다. 휙 내린 직후(관성 스크롤 중)에 누르면 Android 는 남은
 * 관성이 "맨 위로" 이동을 이겨 **될 때도 있고 안 될 때도** 있었다(PM 2026-09-30 05:01)
 */
const SCROLL_TOP_RETRY_MS = [350, 700];
/** 맨 위로 본다 — 정지 오프셋 0 기준 */
const AT_TOP_SLOP = 2;

/**
 * **Android 의 iOS 식 접힘 바**(PM 2026-09-29 17:19 "탐색 내리면 제목이 가운데 새로 생기고, 검색바·주제 알약은 제자리에서
 * 스크롤 — iOS 처럼 똑같이"). iOS 26 `.inline` 큰 제목 바를 흉내낸다:
 * - 바 줄(상태 바 밑 52 = 큰 제목 줄 높이)은 늘 떠 있고, 오른쪽 컨트롤만 고정으로 둔다.
 * - 큰 제목·검색창·칩은 **목록의 첫 줄**로 같이 스크롤한다. 정지 땐 큰 제목이 이 바 줄 자리에 앉아 한 줄로 보인다.
 * - 큰 제목이 절반쯤 밀려 올라가면 가운데 작은 제목(20, iOS 접힌 제목)과 서리 유리 판 + 아래 선이 함께 나타난다.
 * 탭 화면(라이브러리·탐색)은 목록 paddingTop = 상태 바만(큰 제목이 바 줄 자리), 푸시 화면(설정)은 왼쪽에 뒤로 원을 두고
 * 큰 제목을 바 줄 밑에 둔다(iOS 뒤로 버튼 있는 큰 제목) — 목록 paddingTop = 상태 바 + 52 + 간격
 */
export default function AndroidCollapsingBar({
  title,
  scrollY,
  leading,
  trailing,
  blurTarget,
  onTitlePress,
}: AndroidCollapsingBarProps) {
  const insets = useSafeAreaInsets();
  /*
   * 위아래 여백 맞춤(PM 2026-09-30 03:29 "시간·배터리 밑 ↔ 원·알약 위, 원·알약 밑 ↔ 바 아래 선 공백을 같게") — 줄 안에서는
   * 위아래가 같고(52 − 40 = 6 씩) 위쪽엔 상태 바 아이콘 밑 여분이 더해져 넓었다. 그 여분을 바 아래에 같은 만큼 더한다.
   * 줄(버튼·큰 제목 자리)의 위치는 그대로 — 탭 화면에서 정지 때 큰 제목과 한 줄로 서는 배치가 안 바뀐다
   */
  const bottomBalance = Math.max(0, (insets.top - STATUS_ICON_HEIGHT) / 2);
  const collapse = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [LARGE_TITLE_ROW_HEIGHT * 0.5, LARGE_TITLE_ROW_HEIGHT],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );
  /*
   * 작은 제목은 **경계를 넘는 순간 짧게** 올라오며 나타난다(PM 2026-09-30 04:34 "상단바 텍스트 뜨는 거 iOS 처럼 애니메이션") —
   * iOS 는 큰 제목이 바 밑으로 들어가면 작은 제목을 스크롤과 무관한 짧은 페이드로 넣는다. 종전엔 스크롤한 만큼 불투명도만
   * 따라가 멈추면 반투명으로 걸려 있었다. 서리 유리 판은 스크롤을 따라간다(collapse)
   */
  const [isTitleShown, setIsTitleShown] = useState(false);
  const lastOffsetRef = useRef(0);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      lastOffsetRef.current = value;
      setIsTitleShown((prev) => (prev ? value > TITLE_HIDE_BELOW : value > TITLE_SHOW_AT));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);
  const retryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => retryTimersRef.current.forEach(clearTimeout), []);
  const handleTitlePress = () => {
    if (!onTitlePress) return;
    retryTimersRef.current.forEach(clearTimeout);
    onTitlePress();
    retryTimersRef.current = SCROLL_TOP_RETRY_MS.map((ms) =>
      setTimeout(() => {
        if (lastOffsetRef.current > AT_TOP_SLOP) onTitlePress();
      }, ms),
    );
  };
  const titleAppear = useAnimatedValue(0);
  useEffect(() => {
    Animated.timing(titleAppear, {
      toValue: isTitleShown ? 1 : 0,
      duration: motion.duration.normal,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [isTitleShown, titleAppear]);
  return (
    <View
      style={[styles.bar, { paddingTop: insets.top, paddingBottom: bottomBalance }]}
      pointerEvents="box-none"
    >
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
      {/*
        제목 탭 영역 — **바 전체**(상태 바 밑 서리 영역 포함, iOS 상태 바 탭처럼). 제목 줄만 받으면 바의 위·아래를 누른 탭이
        빠졌다(PM 2026-09-30 05:01 "될 때도 있고 안 될 때도"). 좌우 컨트롤은 뒤에 그려 그 위에서 제 탭을 받는다
      */}
      {onTitlePress ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleTitlePress}
          pointerEvents={isTitleShown ? 'auto' : 'none'}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint="맨 위로 이동"
          accessibilityElementsHidden={!isTitleShown}
          importantForAccessibility={isTitleShown ? 'yes' : 'no-hide-descendants'}
        />
      ) : null}
      <View style={styles.row} pointerEvents="box-none">
        <AnimatedText
          style={[
            styles.title,
            {
              opacity: titleAppear,
              transform: [
                {
                  translateY: titleAppear.interpolate({
                    inputRange: [0, 1],
                    outputRange: [TITLE_RISE, 0],
                  }),
                },
              ],
            },
          ]}
          numberOfLines={1}
          importantForAccessibility="no"
          pointerEvents="none"
        >
          {title}
        </AnimatedText>
        {leading}
        <View style={styles.spacer} pointerEvents="none" />
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
  // 흰 막 — 공용 회백(frostedSurface #F5F5F7 72%)보다 희게(PM 2026-09-30 03:19 "흰색 조금 더 강화"). 미니플레이어·독 유리는 그대로
  frostWhite: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
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
    paddingHorizontal: theme.spacing.md,
  },
  spacer: { flex: 1 },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
});
