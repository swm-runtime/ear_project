import { useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import { useWalkthroughStore } from '@/shared/ui/walkthrough.store';

import { ONBOARDING_COPY } from '../onboarding.copy';

/** 이만큼 끌면 넘긴다. 짧으면 스크롤 의도까지 단계 이동으로 먹는다 */
const SWIPE_THRESHOLD = 40;
/** 이 안쪽 움직임은 탭으로 본다 */
const TAP_SLOP = 10;

/** 예시 화면에 쓰는 값 — 실제 콘텐츠가 아니라 흐름을 보여주기 위한 그림이다 */
const SAMPLE = [
  { key: 'a', topic: '경제 상식', title: '금리가 내려가면\n내 월급은 어떻게 되나' },
  { key: 'b', topic: '커뮤니케이션', title: '회의에서 말수가 적어도\n인정받는 법' },
  { key: 'c', topic: '습관·동기', title: '번아웃이 오기 전에\n몸이 보내는 신호' },
] as const;

type Stage = 'explore' | 'library' | 'drip';

/**
 * 첫 사용 튜토리얼 — **예시 화면**을 띄워 서비스가 어떻게 도는지 보여준다.
 *
 * 실제 화면 위에 설명을 얹지 않는 이유: 갓 가입한 사용자의 라이브러리는 비어 있어서
 * 정작 설명할 것이 화면에 없다. 탐색에서 담고 → 라이브러리에 모이고 → 매일 아침
 * 2편이 도착한다는 흐름은 **채워진 화면**을 보여줘야 전달된다.
 *
 * 넘기는 방법은 스와이프다. 탭도 같은 동작으로 받는다 — 스와이프를 모르는 사용자가
 * 갇히지 않게. 신호(useWalkthroughStore.pending)는 온보딩 종료가 세우고 여기서 소비한다.
 * 문서 반영 요청: changes/pending/onboarding-o1-visual-refresh.md
 */
export default function FirstRunTutorial() {
  const pending = useWalkthroughStore((s) => s.pending);
  const clear = useWalkthroughStore((s) => s.clear);
  const [step, setStep] = useState(0);

  const steps: { title: string; body: string; stage: Stage }[] = [
    {
      title: ONBOARDING_COPY.tutorial.exploreTitle,
      body: ONBOARDING_COPY.tutorial.exploreBody,
      stage: 'explore',
    },
    {
      title: ONBOARDING_COPY.tutorial.libraryTitle,
      body: ONBOARDING_COPY.tutorial.libraryBody,
      stage: 'library',
    },
    {
      title: ONBOARDING_COPY.tutorial.dripTitle,
      body: ONBOARDING_COPY.tutorial.dripBody,
      stage: 'drip',
    },
  ];

  const go = (delta: number) => {
    const next = step + delta;
    if (next < 0) return;
    if (next >= steps.length) {
      clear();
      return;
    }
    setStep(next);
  };

  // 매 렌더 새로 만든다 — 손을 뗄 때 한 번만 판정하므로 도중에 끊기지 않고,
  // 핸들러가 항상 최신 단계를 본다(ref로 최신 값을 나르는 배선이 필요 없다)
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
        go(1);
        return;
      }
      if (g.dx <= -SWIPE_THRESHOLD) go(1);
      else if (g.dx >= SWIPE_THRESHOLD) go(-1);
    },
  });

  if (!pending) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const rows = current.stage === 'explore' ? SAMPLE : SAMPLE.slice(0, 2);

  return (
    <View style={styles.backdrop}>
      <SafeAreaView style={styles.safe} {...pan.panHandlers}>
        <Pressable
          style={styles.skip}
          onPress={clear}
          accessibilityRole="button"
          accessibilityLabel={ONBOARDING_COPY.tutorial.skip}
        >
          <Text style={styles.skipLabel}>{ONBOARDING_COPY.tutorial.skip}</Text>
        </Pressable>

        <View style={styles.head}>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>
        </View>

        {/* 예시 화면 — 실제 화면을 흉내 낸 그림이다. 데이터를 부르지 않는다 */}
        <View style={styles.stage}>
          <View style={styles.mock}>
            <Text style={styles.mockHeader}>
              {current.stage === 'explore' ? '탐색' : '라이브러리'}
            </Text>

            {current.stage === 'drip' ? (
              <View style={styles.dripBadge}>
                <Text style={styles.dripBadgeLabel}>오늘 아침 도착 · 2편</Text>
              </View>
            ) : null}

            {rows.map((item, index) => (
              <View key={item.key} style={styles.row}>
                <View style={styles.thumb} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTopic}>{item.topic}</Text>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                </View>
                {current.stage === 'explore' ? (
                  // 첫 줄만 담긴 상태 — "담는다"는 동작이 그림으로 보이게 한다
                  <View style={[styles.mark, index === 0 && styles.markOn]}>
                    {index === 0 ? <CheckIcon size={13} color={theme.color.onPrimary} /> : null}
                  </View>
                ) : null}
                {current.stage === 'drip' ? <Text style={styles.newLabel}>NEW</Text> : null}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.dock}>
          <View style={styles.dots} accessibilityLabel={`${steps.length}단계 중 ${step + 1}단계`}>
            {steps.map((s, i) => (
              <View key={s.title} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>
          <Text style={styles.hint}>
            {isLast ? ONBOARDING_COPY.tutorial.done : ONBOARDING_COPY.tutorial.next}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.background,
  },
  safe: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  skip: {
    alignSelf: 'flex-end',
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  skipLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textDecorationLine: 'underline',
  },
  head: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl * 1.3,
  },
  body: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.md * 1.5,
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
  },
  /** 예시 화면 틀 — 실제 화면과 헷갈리지 않도록 면 위에 담는다 */
  mock: {
    borderRadius: theme.radius.xl,
    backgroundColor: theme.color.surface,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  mockHeader: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  dripBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm + theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.primary,
    marginBottom: theme.spacing.xs,
  },
  dripBadgeLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTopic: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  rowTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.sm * 1.35,
  },
  mark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: theme.color.border,
  },
  markOn: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  newLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.primary,
  },
  dock: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.color.border,
  },
  dotActive: {
    backgroundColor: theme.color.primary,
  },
  hint: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
});
