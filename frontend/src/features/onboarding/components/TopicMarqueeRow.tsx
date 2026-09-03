import { useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
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
 * 웹: scrollLeft를 매 프레임 쓰는 방식은 스크롤이 디바이스 픽셀 단위로만 그려져
 * 느린 속도에서 뚝뚝 끊긴다(2026-09-03 실측). CSS 트랜스폼 애니메이션(컴포지터 합성,
 * 서브픽셀)으로 흐르게 하고, 수동 스와이프 대신 탭 선택만 받는다.
 * 네이티브: ScrollView + rAF — 스와이프·무한 루프 유지.
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
      onScrollBeginDrag={pause}
      onScrollEndDrag={scheduleResume}
      onMomentumScrollEnd={scheduleResume}
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
