import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { AUTH_COPY } from '../auth.copy';
import CodeInput from '../components/CodeInput';
import { useEmailVerificationScreen } from '../hooks/useEmailVerificationScreen';

const EMAIL_COPY = AUTH_COPY.email;

/**
 * 이메일 인증(A10 입력 → A13 코드 확인) — 화면은 뷰만 담당하고 로직은
 * useEmailVerificationScreen이 소유한다. 설정·프로필 두 경로가 같은 화면을 쓴다
 * (auth.md 4.5 — 발송 제한도 경로에 합산 적용되므로 화면을 가르지 않는다).
 */
export default function EmailVerificationScreen() {
  const screen = useEmailVerificationScreen();

  return (
    <SafeAreaView style={styles.container}>
      {/* 앱바 — 서버 응답과 무관하므로 로딩 중에도 먼저 그린다 */}
      <View style={styles.appBar}>
        <Pressable
          style={styles.backButton}
          onPress={screen.goBack}
          accessibilityRole="button"
          accessibilityLabel={EMAIL_COPY.backA11y}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appBarTitle}>{EMAIL_COPY.appBarTitle}</Text>
        <View style={styles.backButton} />
      </View>

      {screen.loadFailed ? (
        <FullScreenError
          title={EMAIL_COPY.loadFailed}
          isRetrying={screen.isRetryingLoad}
          onRetry={screen.retryLoad}
        />
      ) : screen.showSkeleton ? (
        <View style={styles.body}>
          <View style={styles.skeletonLine} />
          <View style={styles.skeletonField} />
        </View>
      ) : screen.step === 'input' ? (
        /* ── A10 이메일 입력 — 설정·프로필 경로는 진입 사유 문구가 없다(auth-uiux.md 4.7) ── */
        <>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>{EMAIL_COPY.currentLabel}</Text>
            <Text style={styles.currentEmail}>
              {screen.currentEmail ?? EMAIL_COPY.unregistered}
            </Text>

            <Text style={styles.fieldLabel}>{EMAIL_COPY.inputLabel}</Text>
            <TextInput
              style={[styles.input, screen.inputError !== null && styles.inputInvalid]}
              value={screen.emailInput}
              onChangeText={screen.changeEmailInput}
              onBlur={screen.validateEmailInput}
              placeholder={EMAIL_COPY.inputPlaceholder}
              placeholderTextColor={theme.color.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel={EMAIL_COPY.inputLabel}
            />
            {screen.inputError !== null ? (
              // 사용자가 시작한 입력·발송의 직접 결과라 assertive다(auth-uiux.md 7장)
              <Text style={styles.inlineError} accessibilityLiveRegion="assertive">
                {screen.inputError}
              </Text>
            ) : null}
            {/* 변경도 신규 등록과 같은 절차임을 밝힌다(auth-uiux.md 4.7) */}
            <Text style={styles.notice}>{EMAIL_COPY.changeNotice}</Text>
          </ScrollView>

          <View style={styles.dock}>
            <Pressable
              style={[styles.primaryButton, !screen.canSend && styles.primaryButtonDisabled]}
              onPress={screen.submitEmail}
              disabled={!screen.canSend}
              accessibilityRole="button"
              accessibilityLabel={EMAIL_COPY.send}
              accessibilityState={{ disabled: !screen.canSend, busy: screen.isSending }}
            >
              {screen.isSending ? (
                <ActivityIndicator color={theme.color.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonLabel}>{EMAIL_COPY.send}</Text>
              )}
            </Pressable>
          </View>
        </>
      ) : (
        /* ── A13 코드 확인 — 이 플로우의 핵심 화면(auth-uiux.md 4.10) ── */
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.codeGuide}>{EMAIL_COPY.codeGuide(screen.sentEmail)}</Text>

          <View style={styles.codeSection}>
            <CodeInput
              value={screen.codeValue}
              onChange={screen.changeCode}
              editable={screen.isCodeEditable}
            />
            {/* 카운트다운 — 표시용. 만료 판정은 서버가 한다(auth-uiux.md 4.10) */}
            <Text
              style={[styles.countdown, screen.isCountdownWarning && styles.countdownWarning]}
            >
              {screen.countdownLabel}
            </Text>
          </View>

          {screen.isVerifying ? <ActivityIndicator color={theme.color.textPrimary} /> : null}
          {screen.codeError !== null ? (
            <Text style={styles.inlineError} accessibilityLiveRegion="assertive">
              {screen.codeError}
            </Text>
          ) : null}
          {/* 만료(A15)·시도 소진(A16) — 틀림과 다른 문구, [재전송]이 유일한 행동이다 */}
          {screen.codeNotice !== null ? (
            <Text style={styles.inlineError} accessibilityLiveRegion="assertive">
              {screen.codeNotice}
            </Text>
          ) : null}
          {/* 발송 잠금(A17) — 그 주소에만 걸린다. [메일 다시 입력]은 아래에서 활성 유지 */}
          {screen.lockNotice !== null ? (
            <Text style={styles.lockNotice} accessibilityLiveRegion="polite">
              {screen.lockNotice}
            </Text>
          ) : null}

          {/* [재전송] 주 액션 — 비활성 이유를 색이 아니라 텍스트로 밝힌다(auth-uiux.md 7장) */}
          <Pressable
            style={[styles.primaryButton, !screen.canResend && styles.primaryButtonDisabled]}
            onPress={screen.resend}
            disabled={!screen.canResend}
            accessibilityRole="button"
            accessibilityLabel={screen.resendLabel}
            accessibilityState={{ disabled: !screen.canResend }}
          >
            {screen.isSending ? (
              <ActivityIndicator color={theme.color.onPrimary} />
            ) : (
              <Text style={styles.primaryButtonLabel}>{screen.resendLabel}</Text>
            )}
          </Pressable>

          {/* [메일 다시 입력] — 항상 노출·항상 활성. 잘못 입력한 사용자의 유일한 탈출구다(4.10).
              [재전송]과 무게를 가른다 — 텍스트 링크 스타일 */}
          <Pressable
            style={styles.reenterButton}
            onPress={screen.reenterEmail}
            accessibilityRole="button"
            accessibilityLabel={EMAIL_COPY.reenterEmail}
          >
            <Text style={styles.reenterLabel}>{EMAIL_COPY.reenterEmail}</Text>
          </Pressable>

          <Text style={styles.notice}>{EMAIL_COPY.spamNotice}</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  backButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl + 2,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  body: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  fieldLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginTop: theme.spacing.md,
  },
  currentEmail: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  input: {
    minHeight: theme.touchTarget.minHeight,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  inputInvalid: {
    borderColor: theme.color.danger,
  },
  inlineError: {
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
  },
  notice: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  codeGuide: {
    fontSize: theme.font.size.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.lg * 1.4,
    marginTop: theme.spacing.md,
  },
  codeSection: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.md,
  },
  countdown: {
    fontSize: theme.font.size.md,
    fontVariant: ['tabular-nums'],
    color: theme.color.textSecondary,
  },
  countdownWarning: {
    color: theme.color.danger,
  },
  lockNotice: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  dock: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  primaryButton: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  reenterButton: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reenterLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
    textDecorationLine: 'underline',
  },
  skeletonLine: {
    width: 180,
    height: theme.font.size.sm * 1.4,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    marginTop: theme.spacing.md,
  },
  skeletonField: {
    height: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    marginTop: theme.spacing.md,
  },
});
