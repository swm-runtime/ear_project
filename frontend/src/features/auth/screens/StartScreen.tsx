import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import LoadingOverlay from '@/shared/ui/LoadingOverlay';

import { SOCIAL_PROVIDERS } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';
import ProviderButton from '../components/ProviderButton';
import { useStartScreen } from '../hooks/useStartScreen';

/**
 * A1 시작 화면 — 서비스 소개 + 제공자 버튼 3개 + 약관·개인정보 처리방침 링크.
 * 묵시적 동의 문구를 두지 않는다 — 링크만 제공하고 동의 의미를 부여하지 않는다(auth-uiux.md 4.1).
 */
export default function StartScreen() {
  const { isAuthenticating, handleProviderPress, handlePolicyLinkPress } = useStartScreen();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.intro}>
        <Image
          source={require('../../../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={AUTH_COPY.start.appName}
        />
        <Text style={styles.tagline}>{AUTH_COPY.start.tagline}</Text>
        <Text style={styles.description}>{AUTH_COPY.start.description}</Text>
      </View>

      <View style={styles.actions}>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          {/* 장식이 아니라 아래 버튼 묶음을 설명하는 제목이므로 스크린리더에서 읽힌다 */}
          <Text style={styles.dividerLabel} accessibilityRole="header">
            {AUTH_COPY.start.providerSectionLabel}
          </Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.providers}>
          {SOCIAL_PROVIDERS.map((provider) => (
            <ProviderButton
              key={provider}
              provider={provider}
              disabled={isAuthenticating}
              onPress={handleProviderPress}
            />
          ))}
        </View>

        <View style={styles.links}>
          <Pressable
            onPress={() => handlePolicyLinkPress('terms')}
            hitSlop={theme.spacing.sm}
            accessibilityRole="link"
          >
            <Text style={styles.link}>{AUTH_COPY.start.termsLink}</Text>
          </Pressable>
          <Text style={styles.linkSeparator}>·</Text>
          <Pressable
            onPress={() => handlePolicyLinkPress('privacy')}
            hitSlop={theme.spacing.sm}
            accessibilityRole="link"
          >
            <Text style={styles.link}>{AUTH_COPY.start.privacyLink}</Text>
          </Pressable>
        </View>
      </View>

      <LoadingOverlay visible={isAuthenticating} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.lg,
  },
  intro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 200,
  },
  tagline: {
    marginTop: theme.spacing.md,
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  description: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  actions: {
    gap: theme.spacing.sm + theme.spacing.xs,
    paddingBottom: theme.spacing.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  dividerLine: {
    // 폭을 고정한다 — flex로 남는 폭을 다 채우면 문구보다 선이 주인공이 된다
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.border,
  },
  dividerLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  providers: {
    flexDirection: 'row',
    justifyContent: 'center',
    // 64pt 버튼 4개라 간격을 넓게 두면 좁은 기기에서 가로가 넘친다
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  link: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textDecorationLine: 'underline',
  },
  linkSeparator: {
    color: theme.color.textSecondary,
  },
});
