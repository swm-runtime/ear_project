import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { theme } from '@/shared/theme';

import { TopicChip } from '@/features/interest';

/** 무한 루프 — 같은 묶음 3벌을 이어 붙이고 한 벌 폭 주기로 되감는다 */
const LOOP_COPIES = [0, 1, 2] as const;
/** 손을 뗀 뒤 자동 흐름이 다시 시작되기까지의 유예 */
const RESUME_MS = 1500;

export interface MarqueeTopic {
  topicId: string;
  name: string;
  isSelected: boolean;
  isDimmed: boolean;
}

interface TopicMarqueeRowProps {
  topics: MarqueeTopic[];
  /** 1 = 왼쪽으로 흐름 · -1 = 오른쪽으로 흐름 */
  direction: 1 | -1;
  /** 시작 위상(px) — 줄마다 달리 줘서 벽돌처럼 어긋나 보이게 한다 */
  phase: number;
  /** 자동 흐름 속도(px/초) */
  speed: number;
  pillWidth: number;
  dimmedHint: string;
  onToggle: (topicId: string) => void;
}

/**
 * 한 줄짜리 무한 마퀴 — 스스로 흐르고(방향은 줄마다 반대), 만지면 멈춘다.
 *
 * **플랫폼마다 구현이 다르다. 셋 다 실기기에서 실패를 겪고 남은 형태다.**
 *
 * | 플랫폼 | 구현 | 그 이유 |
 * |---|---|---|
 * | web | WAAPI transform | `scrollLeft`를 매 프레임 쓰면 디바이스 픽셀 단위로만 그려져 느린 속도에서 뚝뚝 끊긴다(2026-09-03 실측) |
 * | iOS | `Animated` + `translateX` | `ScrollView`를 rAF로 밀면 `UIScrollView`가 항상 "움직이는 중"이라 **첫 탭을 소비한다.** 터치 시작 시 pause·`delaysContentTouches`·`canCancelContentTouches` 셋 다 실패했다 |
 * | Android | `ScrollView` + rAF | 원래 정상이었다. **iOS와 같은 Animated 구조로 바꿨더니 탭·스와이프가 모두 깨졌다**(2026-09-08 실기기) — 뷰포트(overflow hidden) 밖으로 transform 된 자식이 터치를 받지 못한다 |
 *
 * 한 구조로 통일하려다 두 번 깨뜨렸다. **어느 하나를 고칠 때 나머지를 함께 확인한다.**
 * 수동 스와이프는 web·iOS에는 없고 Android에만 있다 — 마퀴가 자동으로 흐르므로 필수가 아니다.
 */
export default function TopicMarqueeRow(props: TopicMarqueeRowProps) {
  if (Platform.OS === 'web') return <WebMarqueeRow {...props} />;
  if (Platform.OS === 'android') return <AndroidMarqueeRow {...props} />;
  return <IosMarqueeRow {...props} />;
}

/** 한 벌의 픽셀 폭 — 알약 N개 + 벌 끝 여백(알약 간격과 동일) */
const copyWidthOf = (count: number, pillWidth: number): number =>
  count * (pillWidth + theme.spacing.sm);

function MarqueeCopies({
  topics,
  pillWidth,
  dimmedHint,
  onToggle,
}: Pick<TopicMarqueeRowProps, 'topics' | 'pillWidth' | 'dimmedHint' | 'onToggle'>) {
  return (
    <>
      {LOOP_COPIES.map((copy) => (
        <View
          key={copy}
          style={styles.copy}
          // 반복 벌은 시각 전용 — 낭독기에는 가운데 벌 하나만 들린다
          accessibilityElementsHidden={copy !== 1}
          importantForAccessibility={copy !== 1 ? 'no-hide-descendants' : 'auto'}
        >
          {topics.map((topic) => (
            <TopicChip
              key={topic.topicId}
              topicId={topic.topicId}
              label={topic.name}
              isSelected={topic.isSelected}
              isDimmed={topic.isDimmed}
              dimmedHint={dimmedHint}
              style={[styles.pill, { width: pillWidth }]}
              onPress={() => onToggle(topic.topicId)}
            />
          ))}
        </View>
      ))}
    </>
  );
}

function WebMarqueeRow({
  topics,
  direction,
  phase,
  speed,
  pillWidth,
  dimmedHint,
  onToggle,
}: TopicMarqueeRowProps) {
  const innerRef = useRef<View>(null);
  const animRef = useRef<Animation | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pause = () => {
    animRef.current?.pause();
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => animRef.current?.play(), RESUME_MS);
  };

  const copyWidth = copyWidthOf(topics.length, pillWidth);

  // Web Animations API — 컴포지터에서 돌아 JS 지연·픽셀 반올림과 무관하게 부드럽다.
  // (react-native-web의 animationKeyframes는 이 버전에서 적용되지 않아 실측 후 대체 — 2026-09-03)
  useEffect(() => {
    const node = innerRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.animate !== 'function') return undefined;
    const from = direction === 1 ? 0 : -copyWidth;
    const to = direction === 1 ? -copyWidth : 0;
    const anim = node.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: (copyWidth / speed) * 1000, iterations: Infinity, easing: 'linear' },
    );
    // 시작 위상 — 애니메이션 시계를 위상만큼 앞으로 돌린다
    anim.currentTime = ((phase % copyWidth) / speed) * 1000;
    animRef.current = anim;
    return () => {
      anim.cancel();
      animRef.current = null;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [copyWidth, direction, phase, speed]);

  return (
    <View style={styles.webViewport} onTouchStart={pause} onPointerDown={pause}>
      <View ref={innerRef} style={styles.copies}>
        <MarqueeCopies
          topics={topics}
          pillWidth={pillWidth}
          dimmedHint={dimmedHint}
          onToggle={onToggle}
        />
      </View>
    </View>
  );
}

function IosMarqueeRow({
  topics,
  direction,
  phase,
  speed,
  pillWidth,
  dimmedHint,
  onToggle,
}: TopicMarqueeRowProps) {
  const copyWidth = copyWidthOf(topics.length, pillWidth);
  /** 이동량 — 0에서 한 벌 폭까지 가면 같은 그림이라 되감아도 티가 나지 않는다 */
  const progress = useMemo(() => new Animated.Value(0), []);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 멈춘 지점 — 재개할 때 남은 거리만 돌려야 흐름이 튀지 않는다 */
  const offset = useRef(0);

  const runFrom = useCallback(
    (from: number) => {
      if (copyWidth <= 0) return;
      progress.setValue(from);
      const remain = copyWidth - from;
      // 남은 거리를 마저 돈 뒤(첫 구간) 처음부터 무한 반복한다
      loopRef.current = Animated.sequence([
        Animated.timing(progress, {
          toValue: copyWidth,
          duration: (remain / speed) * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.timing(progress, {
            toValue: copyWidth,
            duration: (copyWidth / speed) * 1000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          { resetBeforeIteration: true },
        ),
      ]);
      loopRef.current.start();
    },
    [copyWidth, progress, speed],
  );

  const pause = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    loopRef.current?.stop();
    progress.stopAnimation((value) => {
      offset.current = value;
    });
  }, [progress]);

  const scheduleResume = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => runFrom(offset.current), RESUME_MS);
  }, [runFrom]);

  useEffect(() => {
    // 시작 위상 — 줄마다 다른 지점에서 시작해야 벽돌처럼 어긋나 보인다
    runFrom(copyWidth > 0 ? phase % copyWidth : 0);
    return () => {
      loopRef.current?.stop();
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [copyWidth, phase, runFrom]);

  // 1 = 왼쪽으로 흐름. 되감기 지점(한 벌 폭)에서 같은 그림이 이어지므로 이음새가 안 보인다
  const translateX = progress.interpolate({
    inputRange: [0, copyWidth || 1],
    outputRange: direction === 1 ? [0, -(copyWidth || 1)] : [-(copyWidth || 1), 0],
  });

  return (
    <View style={styles.viewport} onTouchStart={pause} onTouchEnd={scheduleResume} onTouchCancel={scheduleResume}>
      <Animated.View style={[styles.copies, { transform: [{ translateX }] }]}>
        <MarqueeCopies
          topics={topics}
          pillWidth={pillWidth}
          dimmedHint={dimmedHint}
          onToggle={onToggle}
        />
      </Animated.View>
    </View>
  );
}

function AndroidMarqueeRow({
  topics,
  direction,
  phase,
  speed,
  pillWidth,
  dimmedHint,
  onToggle,
}: TopicMarqueeRowProps) {
  const scrollRef = useRef<ScrollView>(null);
  const copyWidth = useRef(0);
  const paused = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 위치의 원본 — contentOffset을 읽어 더하면 반올림이 끼므로 여기서 적산한다 */
  const posX = useRef(0);

  const pause = () => {
    paused.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  };
  /**
   * 손가락이 닿는 즉시 멈춘다 — **드래그로 판정되기 전에** 흐름을 끊어야 한다.
   *
   * `onScrollBeginDrag`는 드래그가 인식된 뒤에야 오므로, 탭 한 번은 흐르는 동안 그대로
   * 지나간다. iOS `UIScrollView`는 그 사이의 터치를 스크롤 조작으로 소비하고 자식
   * Pressable에 넘기지 않아 **iOS에서만 첫 탭이 선택으로 이어지지 않았다**
   * (`tickets/frontend/pending/onboarding-marquee-ios-tap-miss.md`).
   * 웹 경로가 `onTouchStart`에서 즉시 pause하는 것과 대칭을 맞춘다.
   */
  const handleTouchStart = () => pause();
  const scheduleResume = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      paused.current = false;
    }, RESUME_MS);
  };

  /** 되감기 판정 — 벌 폭 기준으로 보정된 x, 보정이 필요 없으면 null */
  const loopTarget = (x: number): number | null => {
    const width = copyWidth.current;
    if (width <= 0) return null;
    if (x < width * 0.5) return x + width;
    if (x > width * 1.5) return x - width;
    return null;
  };

  /** 벌 폭 = 콘텐츠 폭 ÷ 벌 수. 최초 측정 시 가운데 벌 + 위상으로 이동한다 */
  const handleContentSize = (contentWidth: number) => {
    const width = contentWidth / LOOP_COPIES.length;
    if (width > 0 && copyWidth.current === 0) {
      posX.current = width + phase;
      scrollRef.current?.scrollTo({ x: width + phase, animated: false });
    }
    copyWidth.current = Math.max(width, 0);
  };

  /** 한 벌 폭만큼의 순간 이동은 같은 그림이라 사용자에게는 끝없이 이어져 보인다 */
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    // 사용자가 움직였을 때만 적산 위치를 동기화한다(자동 흐름의 반올림 오차는 무시)
    if (Math.abs(x - posX.current) > 1.5) posX.current = x;
    const target = loopTarget(posX.current);
    if (target !== null) {
      posX.current = target;
      scrollRef.current?.scrollTo({ x: target, animated: false });
    }
  };

  // 자동 흐름 — 시간 경과에 따라 적산 위치를 민다
  useEffect(() => {
    let raf = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      if (!paused.current && copyWidth.current > 0) {
        posX.current += direction * speed * dt;
        const target = loopTarget(posX.current);
        if (target !== null) posX.current = target;
        scrollRef.current?.scrollTo({ x: posX.current, animated: false });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [direction, speed]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSize}
      onTouchStart={handleTouchStart}
      // 탭으로 끝난 터치(스크롤 이벤트가 한 번도 오지 않는 경우)에도 흐름이 되살아나야 한다
      onTouchEnd={scheduleResume}
      onTouchCancel={scheduleResume}
      onScrollBeginDrag={pause}
      onScrollEndDrag={scheduleResume}
      onMomentumScrollEnd={scheduleResume}
      // canCancelContentTouches={false}는 쓰지 않는다 — 알약 위에서 시작한 스와이프가
      // 스크롤로 전환되지 않아 수동 스와이프가 막힌다(같은 티켓 후보 2의 부작용).
      scrollEventThrottle={16}
    >
      <View style={styles.copies}>
        <MarqueeCopies
          topics={topics}
          pillWidth={pillWidth}
          dimmedHint={dimmedHint}
          onToggle={onToggle}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  webViewport: {
    overflow: 'hidden',
  },
  /** 네이티브 뷰포트 — ScrollView 가 아니다(아래 NativeMarqueeRow 주석 참조) */
  viewport: {
    overflow: 'hidden',
  },
  copies: {
    flexDirection: 'row',
  },
  /** 벌 끝 여백(paddingRight)이 이음새 간격 — 알약 사이 간격과 같아야 이음새가 안 보인다 */
  copy: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.sm,
  },
  pill: {
    flexGrow: 0,
    flexBasis: 'auto',
  },
});
