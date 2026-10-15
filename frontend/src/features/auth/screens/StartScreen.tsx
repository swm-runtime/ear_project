import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_LANGUAGE } from '@/shared/i18n/locale';
import { theme } from '@/shared/theme';
import LoadingOverlay from '@/shared/ui/LoadingOverlay';
import { Text } from '@/shared/ui/Typography';

import { AUTH_COPY } from '../auth.copy';
import ProviderButton from '../components/ProviderButton';
import { useStartScreen } from '../hooks/useStartScreen';
import { providersFor } from '../services/start-providers';

/** 로그인 전이라 시장을 모른다 — 표시 언어로 거른다(영어면 Google·Apple만, auth-uiux.md 4.1) */
const PROVIDERS = providersFor(APP_LANGUAGE);

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
          source={require('../../../../assets/logo-mark.png')}
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
          {PROVIDERS.map((provider) => (
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
    // 로고는 투명 바탕 검정 한 색 — tintColor 로 모드에 맞춘다(라이트 검정 · 다크 흰색, 2026-10-11)
    tintColor: theme.color.textPrimary,
    width: 200,
    height: 200,
  },
  tagline: {
    marginTop: theme.spacing.md,
    // 영어 등 긴 문구가 두 줄로 접혀도 가운데 정렬을 유지한다(KAN-197)
    textAlign: 'center',
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  description: {
    marginTop: theme.spacing.sm,
    textAlign: 'center',
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
    // 선은 고정 폭이고 줄어드는 쪽은 문구다 — 긴 영어 문구가 가로로 넘치지 않고 접힌다(KAN-197)
    flexShrink: 1,
    textAlign: 'center',
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
    // 좁은 기기에서 링크 둘이 한 줄에 안 들어가면 다음 줄로 내린다(KAN-197)
    flexWrap: 'wrap',
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
