import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';

import { PLAYER_COPY } from '../player.copy';
import { useLimitNoticeStore } from '../store/limit-notice.store';

const RING_SIZE = 56;
const RING_STROKE = 5;

/**
 * **한도 안내 시트** — 오늘 재생 한도를 다 썼을 때(PM 2026-09-28 00:11 "오늘 이미 다 들었어요 디자인 수정" → 종전 하단 검정
 * 토스트에서 교체). 잔여 링과 같은 모양의 빈 링(주의색 0) + 확정 문구 + 채워지는 시각 + [확인].
 *
 * 구독 UI 플래그가 켜지면 이 시트가 페이월(paywall.md 4.5)의 자리다 — 요금제 비교·결제 버튼을 이 밑에 얹는다. 플래그가
 * 꺼진 지금은 구독을 한 글자도 언급하지 않는다(App Store 2.1(b), paywall.md 4.5). 판정은 서버 — 이 시트는 표시만 한다
 */
export default function LimitNoticeSheet() {
  const isVisible = useLimitNoticeStore((s) => s.isVisible);
  const message = useLimitNoticeStore((s) => s.message);
  const hide = useLimitNoticeStore((s) => s.hide);

  return (
    <BottomSheet isVisible={isVisible} onRequestClose={hide} sheetStyle={styles.sheet}>
      <View style={styles.body} accessibilityViewIsModal>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={(RING_SIZE - RING_STROKE) / 2}
              stroke={theme.color.danger}
              strokeWidth={RING_STROKE}
              fill="none"
            />
          </Svg>
          <Text style={styles.ringValue}>0</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {message ?? PLAYER_COPY.limitNotice.title}
        </Text>
        <Text style={styles.description}>{PLAYER_COPY.limitNotice.description}</Text>
        <Pressable
          style={styles.button}
          onPress={hide}
          accessibilityRole="button"
          accessibilityLabel={PLAYER_COPY.limitNotice.confirm}
        >
          <Text style={styles.buttonLabel}>{PLAYER_COPY.limitNotice.confirm}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // 다른 시트(더보기·재생 확인)와 같은 면
  sheet: {
    backgroundColor: theme.color.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: 'continuous',
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  body: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  ringValue: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
    lineHeight: RING_SIZE,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.danger,
    fontVariant: ['tabular-nums'],
  },
  title: {
    marginTop: theme.spacing.xs,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    marginTop: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
  },
  buttonLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
