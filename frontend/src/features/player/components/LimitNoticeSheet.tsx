import { useRef } from 'react';
import { Dimensions, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
import { theme } from '@/shared/theme';
import BottomSheet from '@/shared/ui/BottomSheet';
import LockIcon from '@/shared/ui/LockIcon';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import { PaywallPlansSection, useIsPurchaseInProgress } from '@/features/subscription';

import { PLAYER_COPY } from '../player.copy';
import { useLimitNoticeStore } from '../store/limit-notice.store';

const RING_SIZE = 56;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** 잠금 시트의 자물쇠 — 링과 같은 56 자리의 옅은 원 안에 둔다(남은 횟수가 아니라는 것을 모양이 먼저 말한다) */
const LOCK_GLYPH_SIZE = 24;
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
 *
 * **잠금 시트(PW2 — KAN-294)** 도 이 자리다(`reason = series_locked`): 시리즈 잠긴 편. 머리의 잔여 링 대신 **자물쇠 원**, 제목·설명은
 * 잠금 문구다 — 한도 시트를 그대로 쓰면 남은 횟수 링이 "횟수가 모자라서 막혔다"로 읽힌다. 요금제 비교·결제·복원·[닫기]는 페이월과
 * 같다. 구독 UI 가 꺼진 빌드는 구독을 언급하지 않는 문구 + [확인] 뿐이다(서버 문구도 쓰지 않는다 — "프로 구독" 이 들어 있다).
 */
export default function LimitNoticeSheet() {
  const isVisible = useLimitNoticeStore((s) => s.isVisible);
  const message = useLimitNoticeStore((s) => s.message);
  const isPaywall = useLimitNoticeStore((s) => s.isPaywall);
  const remaining = useLimitNoticeStore((s) => s.remaining);
  const reason = useLimitNoticeStore((s) => s.reason);
  const hide = useLimitNoticeStore((s) => s.hide);
  const suspend = useLimitNoticeStore((s) => s.suspend);
  const isPurchasing = useIsPurchaseInProgress();
  const showPlans = isPaywall && IS_SUBSCRIPTION_UI_ENABLED;
  const isSeriesLock = reason === 'series_locked';
  /** 잔여 링을 눌러 열었고 아직 남았다 — 링을 채우고 "N회 더" 제목(2026-10-28). 없으면 종전 소진 모양 */
  const left = remaining !== null && remaining.remaining > 0 ? remaining : null;
  const ratio = left !== null && left.limit > 0 ? Math.min(1, left.remaining / left.limit) : 0;
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

  const lockHeader = (
    <>
      <View
        style={styles.lockCircle}
        testID="limit-notice-lock"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <LockIcon size={LOCK_GLYPH_SIZE} color={theme.color.textPrimary} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {showPlans
          ? (message ?? PLAYER_COPY.seriesLock.title)
          : PLAYER_COPY.seriesLock.unavailableTitle}
      </Text>
      <Text style={styles.description}>
        {showPlans
          ? PLAYER_COPY.seriesLock.description
          : PLAYER_COPY.seriesLock.unavailableDescription}
      </Text>
    </>
  );

  const limitHeader = (
    <>
      <View
        style={styles.ring}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={left !== null ? theme.color.border : theme.color.danger}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          {/* 잔여 표시 링과 같은 문법 — 12시에서 시계 방향으로 남은/한도만큼 */}
          {ratio > 0 ? (
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={theme.color.textPrimary}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
              fill="none"
              rotation={-90}
              origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
          ) : null}
        </Svg>
        {/* 숫자는 줄 높이가 아니라 가운데 정렬 틀로 맞춘다 — lineHeight 로는 글꼴 위아래 여백 때문에 위로 떴다(00:24 PM) */}
        <View style={styles.ringCenter}>
          <Text style={[styles.ringValue, left !== null && styles.ringValueLeft]}>
            {left !== null ? left.remaining : 0}
          </Text>
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {left !== null
          ? PLAYER_COPY.limitNotice.remainingTitle(left.remaining)
          : (message ?? PLAYER_COPY.limitNotice.title)}
      </Text>
      <Text style={styles.description}>{PLAYER_COPY.limitNotice.description}</Text>
    </>
  );

  const body = (
    <View style={styles.body} accessibilityViewIsModal>
      {isSeriesLock ? lockHeader : limitHeader}
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
  ringValueLeft: {
    color: theme.color.textPrimary,
  },
  // 잔여 링과 같은 자리·크기 — 채운 옅은 회색 원(iOS tertiarySystemFill). 주의색을 쓰지 않는다: 소진·실패가 아니다(design.md §1)
  lockCircle: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: theme.color.fillTertiary,
    alignItems: 'center',
    justifyContent: 'center',
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
