import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

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
 * 웹: scrollLeft를 매 프레임 쓰는 방식은 스크롤이 디바이스 픽셀 단위로만 그려져
 * 느린 속도에서 뚝뚝 끊긴다(2026-09-03 실측). CSS 트랜스폼 애니메이션(컴포지터 합성,
 * 서브픽셀)으로 흐르게 하고, 수동 스와이프 대신 탭 선택만 받는다.
 * 네이티브: **Animated + translateX(네이티브 드라이버)** — 웹과 같은 구조다.
 *
 * 처음에는 `ScrollView`를 rAF 마다 `scrollTo` 로 미는 구조였는데, iOS 에서 **흐르는 중의 첫 탭이
 * 선택으로 이어지지 않았다.** `UIScrollView` 입장에서는 contentOffset 이 매 프레임 바뀌므로 항상
 * "움직이는 중"이고, 첫 터치를 스크롤 조작으로 소비한다. 터치 시작 시 pause·`delaysContentTouches`
 * ·`canCancelContentTouches` 를 차례로 시도했으나 **셋 다 실기기에서 실패했다**
 * (`tickets/frontend/pending/onboarding-marquee-ios-tap-miss.md`).
 *
 * 스크롤 뷰를 걷어내면 그 판정 자체가 사라진다. 대신 **수동 스와이프가 없어진다** — 웹이 이미
 * 같은 이유로 포기한 동작이고(위), 마퀴는 자동으로 흐르므로 모든 주제는 가만히 둬도 지나간다.
 * 터치하면 멈추고 손을 떼면 1.5초 뒤 재개하는 규칙은 그대로다.
 */
export default function TopicMarqueeRow(props: TopicMarqueeRowProps) {
  if (Platform.OS === 'web') return <WebMarqueeRow {...props} />;
  return <NativeMarqueeRow {...props} />;
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

function NativeMarqueeRow({
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
