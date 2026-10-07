import { useRef } from 'react';
import { Dimensions, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import { PaywallPlansSection, useIsPurchaseInProgress } from '@/features/subscription';

import { PLAYER_COPY } from '../player.copy';
import { useLimitNoticeStore } from '../store/limit-notice.store';

const RING_SIZE = 56;
const RING_STROKE = 5;
/** 요금제 비교가 얹히면 시트가 길어진다 — 화면 위쪽을 남기고 안에서 스크롤한다 */
const PAYWALL_MAX_HEIGHT = Dimensions.get('window').height * 0.72;
/**
 * Android 는 시트가 내려간 뒤를 알리는 콜백이 없다(BottomSheet onClosed 는 iOS 전용) — 닫히는 모션이 끝날 즈음
 * 막혔던 콘텐츠를 다시 요청한다. iOS 는 모달이 내려가는 동안 새 모달(플레이어)을 띄우면 무시되므로 onClosed 를 기다린다
 */
const ANDROID_RESUME_DELAY_MS = 400;

/**
 * **한도 안내 시트** — 오늘 재생 한도를 다 썼을 때(PM 2026-09-28 00:11 "오늘 이미 다 들었어요 디자인 수정" → 종전 하단 검정
 * 토스트에서 교체). 잔여 링과 같은 모양의 빈 링(주의색 0) + 확정 문구 + 채워지는 시각 + [확인].
 *
 * **이 시트가 페이월(paywall.md 4.5)의 자리다** — 무료 한도 소진으로 열렸고 구독 UI 가 켜진 바이너리면 밑에 요금제 비교·결제
 * 버튼을 얹고 [확인]은 [닫기]가 된다(KAN-120). 구독 UI 가 꺼진 바이너리(플래그·결제 모듈·플랫폼)에서는 구독을 한 글자도
 * 언급하지 않는다(App Store 2.1(b)). 판정은 서버 — 이 시트는 표시만 한다.
 *
 * 결제가 확정되면 시트를 닫고 막혔던 콘텐츠를 게이트가 다시 요청한다(store 의 resume — 결제 쪽은 player 를 모른다).
 */
export default function LimitNoticeSheet() {
  const isVisible = useLimitNoticeStore((s) => s.isVisible);
  const message = useLimitNoticeStore((s) => s.message);
  const isPaywall = useLimitNoticeStore((s) => s.isPaywall);
  const hide = useLimitNoticeStore((s) => s.hide);
  const suspend = useLimitNoticeStore((s) => s.suspend);
  const isPurchasing = useIsPurchaseInProgress();
  const showPlans = isPaywall && IS_SUBSCRIPTION_UI_ENABLED;
  /** iOS — 시트가 완전히 내려간 뒤 부를 재생 요청 */
  const pendingResumeRef = useRef<(() => void) | null>(null);

  // 결제 진행 중에는 닫기를 막는다(paywall.md 5장 "결제 진행 중 — 시트 닫기 차단")
  const requestClose = () => {
    if (isPurchasing) return;
    hide();
  };

  /** 구독 확정 — 시트를 닫고 막혔던 콘텐츠를 다시 요청한다(paywall.md 4.5-5). 재요청도 게이트라 서버가 다시 판정한다 */
  const handleEntitled = () => {
    const resume = useLimitNoticeStore.getState().resume;
    hide();
    if (resume === null) return;
    if (Platform.OS === 'ios') {
      pendingResumeRef.current = resume;
      return;
    }
    setTimeout(resume, ANDROID_RESUME_DELAY_MS);
  };

  const handleClosed = () => {
    const resume = pendingResumeRef.current;
    pendingResumeRef.current = null;
    resume?.();
  };

  const body = (
    <View style={styles.body} accessibilityViewIsModal>
      <View
        style={styles.ring}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
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
        {/* 숫자는 줄 높이가 아니라 가운데 정렬 틀로 맞춘다 — lineHeight 로는 글꼴 위아래 여백 때문에 위로 떴다(00:24 PM) */}
        <View style={styles.ringCenter}>
          <Text style={styles.ringValue}>0</Text>
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {message ?? PLAYER_COPY.limitNotice.title}
      </Text>
      <Text style={styles.description}>{PLAYER_COPY.limitNotice.description}</Text>
      {showPlans ? (
        <PaywallPlansSection onEntitled={handleEntitled} onDelayed={hide} onEmailGate={suspend} />
      ) : null}
      <Pressable
        style={[
          pillButton.base,
          showPlans ? pillButton.secondary : pillButton.primary,
          styles.button,
        ]}
        onPress={requestClose}
        disabled={isPurchasing}
        accessibilityRole="button"
        accessibilityLabel={
          showPlans ? PLAYER_COPY.limitNotice.close : PLAYER_COPY.limitNotice.confirm
        }
        accessibilityState={{ disabled: isPurchasing }}
      >
        <Text style={showPlans ? pillButton.secondaryLabel : pillButton.primaryLabel}>
          {showPlans ? PLAYER_COPY.limitNotice.close : PLAYER_COPY.limitNotice.confirm}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <BottomSheet
      isVisible={isVisible}
      onRequestClose={requestClose}
      onClosed={handleClosed}
      sheetStyle={styles.sheet}
    >
      {showPlans ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
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
  scroll: {
    maxHeight: PAYWALL_MAX_HEIGHT,
  },
  body: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    includeFontPadding: false,
    textAlignVertical: 'center',
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
  // 크기만 — 모양·색은 공용 알약(pillButton). 페이월의 [닫기]는 결제 버튼(검정)이 주 동작이라 보조 면으로 내린다
  button: {
    alignSelf: 'stretch',
    marginTop: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight,
  },
});
