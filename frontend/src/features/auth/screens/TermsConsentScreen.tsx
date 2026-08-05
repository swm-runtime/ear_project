import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';

import { AUTH_COPY } from '../auth.copy';
import type { AuthStackParamList } from '../auth.types';
import ConsentItem from '../components/ConsentItem';
import { useTermsConsentScreen } from '../hooks/useTermsConsentScreen';

type TermsConsentScreenProps = NativeStackScreenProps<AuthStackParamList, 'TermsConsent'>;

/**
 * A4 약관 동의 — 신규 가입 시 별도 화면. [동의하고 시작하기]를 누른 시점에 계정이 생성된다.
 * 모든 체크박스는 기본값 해제(auth-uiux.md 4.3). 이탈 시 계정이 만들어지지 않는다.
 */
export default function TermsConsentScreen({ route }: TermsConsentScreenProps) {
  const {
    items,
    isAllChecked,
    canSubmit,
    isSubmitting,
    toggleConsent,
    toggleAll,
    handleViewPress,
    handleSubmit,
  } = useTermsConsentScreen(route.params);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.title}>{AUTH_COPY.consent.title}</Text>

        <Pressable
          style={styles.agreeAll}
          onPress={toggleAll}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isAllChecked }}
          accessibilityLabel={AUTH_COPY.consent.agreeAll}
        >
          <View style={[styles.agreeAllBox, isAllChecked && styles.agreeAllBoxChecked]}>
            <Text
              style={[styles.agreeAllMark, isAllChecked && styles.agreeAllMarkChecked]}
            >
              ✓
            </Text>
          </View>
          <Text style={styles.agreeAllLabel}>{AUTH_COPY.consent.agreeAll}</Text>
        </Pressable>

        <View style={styles.divider} />

        {items.map((item) => (
          <ConsentItem
            key={item.consentType}
            label={item.label}
            isRequired={item.isRequired}
            isChecked={item.isChecked}
            description={item.description}
            onToggle={() => toggleConsent(item.consentType)}
            onViewPress={() => handleViewPress(item.consentType)}
          />
        ))}
      </View>

      <Pressable
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        disabled={!canSubmit || isSubmitting}
        onPress={handleSubmit}
        accessibilityRole="button"
        accessibilityLabel={AUTH_COPY.consent.submit}
        accessibilityState={{ disabled: !canSubmit || isSubmitting }}
      >
        {isSubmitting ? (
          <ActivityIndicator color={theme.color.onPrimary} />
        ) : (
          <Text style={styles.submitLabel}>{AUTH_COPY.consent.submit}</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.lg,
  },
  body: {
    flex: 1,
    paddingTop: theme.spacing.xl,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.lg * 1.4,
    marginBottom: theme.spacing.xl,
  },
  agreeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
  },
  agreeAllBox: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm + theme.spacing.xs,
  },
  agreeAllBoxChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  agreeAllMark: {
    color: theme.color.border,
    fontSize: theme.font.size.md,
    fontWeight: '700',
  },
  agreeAllMarkChecked: {
    color: theme.color.onPrimary,
  },
  agreeAllLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.border,
    marginVertical: theme.spacing.sm,
  },
  submit: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  submitDisabled: {
    backgroundColor: theme.color.border,
  },
  submitLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
