import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { PRIVACY_POLICY_URL, TERMS_URL } from '@/shared/lib/legal-urls';
import { logger } from '@/shared/lib/logger';
import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { SUBSCRIPTION_COPY } from '../subscription.copy';

const openUrl = (url: string): void => {
  Linking.openURL(url).catch((error) => logger.warn('[subscription] failed to open link', error));
};

/**
 * 스토어 정책상 필수 표기(subscription.md 5장) — 자동 갱신 조건·갱신 시점·해지 방법·가격·기간·약관·개인정보처리방침.
 * 빠지면 심사에서 반려된다. **법적 고지는 완곡하게 바꾸지 않는다**(convention.md 3.5). 가격은 카드에 있다.
 */
export default function SubscriptionLegalNotice() {
  const lines =
    Platform.OS === 'android' ? SUBSCRIPTION_COPY.legal.android : SUBSCRIPTION_COPY.legal.ios;
  return (
    <View style={styles.container}>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      <View style={styles.links}>
        <Pressable
          style={styles.link}
          onPress={() => openUrl(TERMS_URL)}
          accessibilityRole="link"
          accessibilityLabel={SUBSCRIPTION_COPY.legal.terms}
        >
          <Text style={styles.linkLabel}>{SUBSCRIPTION_COPY.legal.terms}</Text>
        </Pressable>
        <Pressable
          style={styles.link}
          onPress={() => openUrl(PRIVACY_POLICY_URL)}
          accessibilityRole="link"
          accessibilityLabel={SUBSCRIPTION_COPY.legal.privacy}
        >
          <Text style={styles.linkLabel}>{SUBSCRIPTION_COPY.legal.privacy}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  line: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  links: {
    flexDirection: 'row',
    gap: theme.spacing.md,
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
});
