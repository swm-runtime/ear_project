import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import { useWalkthroughStore } from '@/shared/ui/walkthrough.store';

import { EXPLORE_COPY } from '../explore.copy';

/**
 * 첫 사용 코치마크 — 온보딩 직후 착지한 **실제 탐색 화면 위**에 얹는 오버레이 2단계.
 * ① 검색줄을 가리키며 "검색하고 담기" ② 하단 라이브러리 탭을 가리키며 "매일 2편 도착".
 * 신호(useWalkthroughStore.pending)는 온보딩 종료가 세우고 여기서 소비한다.
 * 문서 반영 요청: changes/pending/onboarding-o1-visual-refresh.md
 */
export default function ExploreWalkthrough() {
  const pending = useWalkthroughStore((s) => s.pending);
  const clear = useWalkthroughStore((s) => s.clear);
  const [step, setStep] = useState(0);

  if (!pending) return null;
  const isLast = step === 1;

  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      {/* [건너뛰기] — 우상단. 코치마크는 언제든 닫을 수 있어야 한다 */}
      <Pressable
        style={styles.skip}
        onPress={clear}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.walkthrough.skip}
      >
        <Text style={styles.skipLabel}>{EXPLORE_COPY.walkthrough.skip}</Text>
      </Pressable>

      {step === 0 ? (
        // ① 검색줄(화면 상단)을 가리킨다
        <View style={styles.topAnchor}>
          <View style={styles.arrowUp} />
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{EXPLORE_COPY.walkthrough.searchStep}</Text>
          </View>
        </View>
      ) : (
        // ② 하단 탭 줄의 라이브러리(첫 탭, 왼쪽)를 가리킨다
        <View style={styles.bottomAnchor}>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{EXPLORE_COPY.walkthrough.libraryStep}</Text>
          </View>
          <View style={styles.arrowDown} />
        </View>
      )}

      <Pressable
        style={styles.cta}
        onPress={() => {
          if (isLast) {
            clear();
            return;
          }
          setStep(1);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          isLast ? EXPLORE_COPY.walkthrough.done : EXPLORE_COPY.walkthrough.next
        }
      >
        <Text style={styles.ctaLabel}>
          {isLast ? EXPLORE_COPY.walkthrough.done : EXPLORE_COPY.walkthrough.next}
        </Text>
      </Pressable>
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 50,
  },
  skip: {
    position: 'absolute',
    top: theme.spacing.xl,
    right: theme.spacing.lg,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  skipLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
    textDecorationLine: 'underline',
  },
  /** ① 검색줄 바로 아래 — 위를 향한 화살촉이 검색줄을 가리킨다 */
  topAnchor: {
    position: 'absolute',
    top: 108,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    alignItems: 'center',
  },
  /** ② 하단 탭 위 — 아래를 향한 화살촉이 왼쪽(라이브러리 탭)을 가리킨다 */
  bottomAnchor: {
    position: 'absolute',
    bottom: theme.spacing.md,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    alignItems: 'flex-start',
  },
  bubble: {
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    maxWidth: 320,
  },
  bubbleText: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.md * 1.5,
  },
  arrowUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: theme.color.background,
  },
  arrowDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.color.background,
    marginLeft: 36,
  },
  cta: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
});
