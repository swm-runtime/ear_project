import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import type { SubscriptionStatusVM } from '../hooks/subscription-status';
import { SUBSCRIPTION_COPY } from '../subscription.copy';

export interface CurrentSubscriptionDetailProps {
  /** 서버 GET /users/me/subscription 의 VM. 아직 못 받았으면 null */
  status: SubscriptionStatusVM | null;
  isError: boolean;
  /**
   * 이용 중 카드 밖에 홀로 그릴 때(서버가 `current` 카드를 주지 않은 구독자 — 비활성 요금제·다른 스토어 구독,
   * subscription-api.md 4.1). 카드의 이름 줄이 없으니 플랜명을 제목으로 두고 면을 깐다
   */
  standalone?: boolean;
}

/**
 * 현재 구독 정보(SB1 — subscription-uiux.md 4.1). **이용 중 카드 안에 들어간다**(KAN-146).
 * **글자만 그린다 — 버튼을 두지 않는다**(PM 2026-10-08 "각 박스 안에 있는 버튼들 원초적으로 다 없애"). 해지·다시 시작·결제
 * 수단 확인은 전부 "카드 고르기 + 목록 아래 버튼 하나"가 맡는다(PlanList). 카드 안에 버튼이 있으면 결제 직후 상태가 바뀌는
 * 사이에 [구독 해지]가 잠깐 보였다 사라졌다.
 * 다운그레이드·해지 예약 안내는 제목 밑 알림 섹션 몫이다(KAN-160).
 *
 * 무료 이용자는 그릴 것이 없다 — 이용 중 카드의 설명(서버 `description`)이 한도를 말한다. 판정은 전부 서버 값(status 4분기)이다.
 */
export default function CurrentSubscriptionDetail({
  status,
  isError,
  standalone = false,
}: CurrentSubscriptionDetailProps) {
  if (status === null) {
    // 조회 실패 — 다시 받는 것은 화면 복귀(포커스) 때의 재조회가 한다. 카드 안에 [다시 시도]를 두지 않는다
    if (!isError) return null;
    return (
      <View style={[styles.container, standalone ? styles.standalone : styles.inCard]}>
        <Text style={styles.body}>{SUBSCRIPTION_COPY.status.loadError}</Text>
      </View>
    );
  }
  if (status.kind === 'free') return null;

  const renewsAt = status.kind === 'subscribed' ? status.renewsAt : null;
  const hasContent =
    standalone || renewsAt !== null || status.kind === 'grace' || status.otherStore !== null;
  if (!hasContent) return null;

  return (
    <View style={[styles.container, standalone ? styles.standalone : styles.inCard]}>
      {standalone ? <Text style={styles.title}>{status.planName}</Text> : null}
      {renewsAt !== null ? (
        <Text style={styles.body}>{SUBSCRIPTION_COPY.status.renewsAt(renewsAt)}</Text>
      ) : null}
      {status.kind === 'grace' ? (
        // 결제 문제 — 경고색을 쓰는 유일한 상태. 색만이 아니라 제목 글자로도 밝힌다
        <View style={styles.warningBanner} accessibilityRole="alert">
          <Text style={styles.warningTitle}>{SUBSCRIPTION_COPY.status.paymentIssueTitle}</Text>
          <Text style={styles.warningBody}>{SUBSCRIPTION_COPY.status.paymentIssueBody}</Text>
        </View>
      ) : null}
      {status.otherStore !== null ? (
        <Text style={styles.body}>{SUBSCRIPTION_COPY.status.otherStore(status.otherStore)}</Text>
      ) : null}
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
});
