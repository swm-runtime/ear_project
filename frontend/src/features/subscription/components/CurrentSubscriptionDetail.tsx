import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import type { SubscriptionStatusVM } from '../hooks/subscription-status';
import { SUBSCRIPTION_COPY } from '../subscription.copy';

export interface CurrentSubscriptionDetailProps {
  /** 서버 GET /users/me/subscription 의 VM. 아직 못 받았으면 null */
  status: SubscriptionStatusVM | null;
  isError: boolean;
  onRetry: () => void;
  isRetrying: boolean;
  /** [구독 해지]·[구독 다시 시작]·[결제 수단 확인] — 스토어 구독 관리로 보낸다(해지 API 없음, subscription.md 4.5) */
  onOpenStore: () => void;
  /**
   * 이용 중 카드 밖에 홀로 그릴 때(서버가 `current` 카드를 주지 않은 구독자 — 비활성 요금제·다른 스토어 구독,
   * subscription-api.md 4.1). 카드의 이름 줄이 없으니 플랜명을 제목으로 두고 면을 깐다
   */
  standalone?: boolean;
  /**
   * [구독 해지]를 그리지 않는다 — 요금제 목록에 고를 수 있는 무료 요금제(`cancel`)가 있으면 해지는 "그 요금제로 변경"이
   * 맡는다(PM 2026-10-08). 구독 다시 시작·결제 수단 확인은 요금제 바꾸기가 아니라서 그대로 둔다
   */
  hideCancel?: boolean;
  /** [구독 다시 시작]을 그리지 않는다 — 이용 중 카드를 골라 아래 버튼으로 다시 시작한다(PM 2026-10-08) */
  hideResume?: boolean;
}

/**
 * 현재 구독 정보(SB1 — subscription-uiux.md 4.1). **이용 중 카드 안에 들어간다**(KAN-146 — 종전 "현재 구독" 섹션 제거).
 * 다음 결제일·다운그레이드 예약·해지 예약·결제 문제·다른 스토어 안내와 스토어로 보내는 버튼을 소유한다.
 * 카드가 회색이어도 **누를 수 있는 버튼은 평소 색이다** — 해지 경로는 심사 대상이다.
 *
 * 무료 이용자는 그릴 것이 없다 — 이용 중 카드의 설명(서버 `description`)이 한도를 말한다. 판정은 전부 서버 값(status 4분기)이다.
 */
export default function CurrentSubscriptionDetail({
  status,
  isError,
  onRetry,
  isRetrying,
  onOpenStore,
  standalone = false,
  hideCancel = false,
  hideResume = false,
}: CurrentSubscriptionDetailProps) {
  if (status === null) {
    if (!isError) return null;
    return (
      <View style={[styles.container, standalone ? styles.standalone : styles.inCard]}>
        <Text style={styles.body}>{SUBSCRIPTION_COPY.status.loadError}</Text>
        <Pressable
          style={styles.inlineRetry}
          onPress={onRetry}
          disabled={isRetrying}
          accessibilityRole="button"
          accessibilityLabel={SUBSCRIPTION_COPY.error.retry}
          accessibilityState={{ disabled: isRetrying }}
        >
          <Text style={styles.inlineRetryLabel}>{SUBSCRIPTION_COPY.error.retry}</Text>
        </Pressable>
      </View>
    );
  }
  if (status.kind === 'free') return null;

  const storeButton = (label: string) => (
    <Pressable
      style={({ pressed }) => [
        pillButton.base,
        styles.storeButton,
        pressed ? styles.pressed : null,
      ]}
      onPress={onOpenStore}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={pillButton.secondaryLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, standalone ? styles.standalone : styles.inCard]}>
      {standalone ? <Text style={styles.title}>{status.planName}</Text> : null}
      {status.kind === 'subscribed' ? (
        <>
          {status.renewsAt !== null ? (
            <Text style={styles.body}>{SUBSCRIPTION_COPY.status.renewsAt(status.renewsAt)}</Text>
          ) : null}
          {/* 다운그레이드 예약 안내는 제목 밑 알림 섹션이 맡는다(KAN-160 — 같은 문구를 두 곳에 두지 않는다) */}
        </>
      ) : null}
      {/* 해지 예약("N월 N일까지…")도 제목 밑 알림 섹션이 맡는다(KAN-160) */}
      {status.kind === 'grace' ? (
        // 결제 문제 — 경고색을 쓰는 유일한 상태. 색만이 아니라 제목 글자로도 밝힌다
        <View style={styles.warningBanner} accessibilityRole="alert">
          <Text style={styles.warningTitle}>{SUBSCRIPTION_COPY.status.paymentIssueTitle}</Text>
          <Text style={styles.warningBody}>{SUBSCRIPTION_COPY.status.paymentIssueBody}</Text>
        </View>
      ) : null}
      {status.otherStore !== null ? (
        <Text style={styles.body}>{SUBSCRIPTION_COPY.status.otherStore(status.otherStore)}</Text>
      ) : status.kind === 'subscribed' ? (
        hideCancel ? null : (
          storeButton(SUBSCRIPTION_COPY.manage.cancel)
        )
      ) : status.kind === 'cancelScheduled' ? (
        hideResume ? null : (
          storeButton(SUBSCRIPTION_COPY.manage.resume)
        )
      ) : (
        storeButton(SUBSCRIPTION_COPY.manage.checkPayment)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  // 이용 중 카드 안 — [이용 중] 알약과 한 박자 띄운다
  inCard: {
    marginTop: theme.spacing.xs,
  },
  // 카드 밖에 홀로 설 때 — 요금제 카드와 같은 면
  standalone: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  // 회색 카드 안이어도 구독 정보는 읽혀야 한다 — 회색 단계(textMuted)가 아니라 보조 글자색
  body: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  warningBanner: {
    marginTop: theme.spacing.xs,
    padding: theme.spacing.sm,
    gap: 2,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.warningSurface,
  },
  warningTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.warning,
  },
  warningBody: {
    fontSize: theme.font.size.xs,
    color: theme.color.warning,
  },
  // 흰 알약(회색 카드 위) — 모양은 공용 알약(pillButton.base), 면 색·크기만 여기서. 평소 색 그대로다
  storeButton: {
    marginTop: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
    backgroundColor: theme.color.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
  },
  pressed: {
    opacity: 0.8,
  },
  inlineRetry: {
    alignSelf: 'flex-start',
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
  },
  inlineRetryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
});
