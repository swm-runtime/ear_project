import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { PRIVACY_POLICY_URL, TERMS_URL } from '@/shared/lib/legal-urls';
import { logger } from '@/shared/lib/logger';
import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { SUBSCRIPTION_COPY } from '../subscription.copy';

/** 안내 항목 글머리 칸의 폭 — 글자 크기(xs 12)의 "·" 하나 + 숨 */
const BULLET_COLUMN_WIDTH = 10;

const openUrl = (url: string): void => {
  Linking.openURL(url).catch((error) => logger.warn('[subscription] failed to open link', error));
};

export interface SubscriptionLegalNoticeProps {
  /** [구매 복원] — 스토어 심사 요건(3.1.1). 요금제 관리·페이월 둘 다 이 줄에서 닿는다 */
  onRestore: () => void;
  /** 결제·복원 진행 중 — 연타 차단 */
  isRestoreDisabled: boolean;
  isRestoring: boolean;
}

/** 링크 사이 구분점 — 장식이라 낭독기에서 뺀다 */
function Separator() {
  return (
    <Text
      style={styles.separator}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {SUBSCRIPTION_COPY.legal.separator}
    </Text>
  );
}

/**
 * 스토어 정책상 필수 표기(subscription.md 5장) — 자동 갱신 조건·갱신 시점·해지 방법·가격·기간·약관·개인정보처리방침.
 * 빠지면 심사에서 반려된다. **법적 고지는 완곡하게 바꾸지 않는다**(convention.md 3.5). 가격은 카드에 있다.
 *
 * 안내는 세 줄을 "·" 글머리 항목(내어쓰기)으로, 맨 아래 한 줄 **"이용약관 · 개인정보처리방침 · 구매 복원"** 가운데 정렬
 * (KAN-146 — 카드 아래 큰 복원 링크를 이 줄로 옮겼다). 요금제 관리·페이월이 같은 컴포넌트다.
 */
export default function SubscriptionLegalNotice({
  onRestore,
  isRestoreDisabled,
  isRestoring,
}: SubscriptionLegalNoticeProps) {
  const lines =
    Platform.OS === 'android' ? SUBSCRIPTION_COPY.legal.android : SUBSCRIPTION_COPY.legal.ios;
  return (
    <View style={styles.container}>
      <View style={styles.items}>
        {lines.map((line) => (
          // 글머리 "·"는 고정 폭 칸, 글은 남은 폭 — 줄이 바뀌어도 둘째 줄이 점 밑이 아니라 글 시작에 맞는다(내어쓰기)
          <View key={line} style={styles.item}>
            <Text
              style={[styles.line, styles.bullet]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {SUBSCRIPTION_COPY.legal.separator}
            </Text>
            <Text style={[styles.line, styles.itemText]}>{line}</Text>
          </View>
        ))}
      </View>
      <View style={styles.links}>
        <Pressable
          style={styles.link}
          onPress={() => openUrl(TERMS_URL)}
          accessibilityRole="link"
          accessibilityLabel={SUBSCRIPTION_COPY.legal.terms}
        >
          <Text style={styles.linkLabel}>{SUBSCRIPTION_COPY.legal.terms}</Text>
        </Pressable>
        <Separator />
        <Pressable
          style={styles.link}
          onPress={() => openUrl(PRIVACY_POLICY_URL)}
          accessibilityRole="link"
          accessibilityLabel={SUBSCRIPTION_COPY.legal.privacy}
        >
          <Text style={styles.linkLabel}>{SUBSCRIPTION_COPY.legal.privacy}</Text>
        </Pressable>
        <Separator />
        <Pressable
          style={styles.link}
          onPress={onRestore}
          disabled={isRestoreDisabled}
          accessibilityRole="button"
          accessibilityLabel={SUBSCRIPTION_COPY.restore}
          accessibilityState={{ disabled: isRestoreDisabled, busy: isRestoring }}
        >
          <Text style={styles.linkLabel}>{SUBSCRIPTION_COPY.restore}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 카드와 필수 안내문 사이 24pt(KAN-146 PM 미리보기 확정)
  container: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  items: {
    gap: 2,
  },
  item: {
    flexDirection: 'row',
  },
  line: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  bullet: {
    width: BULLET_COLUMN_WIDTH,
  },
  itemText: {
    flex: 1,
  },
  // 좁은 화면·큰 글꼴에서는 줄을 바꿔도 가운데를 지킨다
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: theme.spacing.sm,
  },
  link: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
  },
  linkLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textDecorationLine: 'underline',
  },
  separator: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
});
