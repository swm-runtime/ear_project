import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';

import { AUTH_COPY } from '../auth.copy';
import ConsentItem from '../components/ConsentItem';
import { useReconsentScreen } from '../hooks/useReconsentScreen';

/**
 * A20 재동의 — 기존 사용자(auth-uiux.md 4.3-1).
 *
 * **A4(신규 가입)와 다른 점 셋**: ① 서버가 준 `pending_consents` 항목만 그린다
 * ② 뒤로가기가 없다 — 되돌아갈 화면이 없다 ③ 거절 경로가 로그아웃이다.
 *
 * 관문(RootNavigator)이 이 화면을 단독으로 렌더하므로 내비게이션 스택을 갖지 않는다.
 * 동의를 마치면 세션의 신호가 지워지고 관문이 다음 목적지로 넘긴다.
 */
export default function ReconsentScreen() {
  const {
    items,
    isAllChecked,
    canSubmit,
    isSubmitting,
    toggleConsent,
    toggleAll,
    handleViewPress,
    handleSubmit,
    isLogoutConfirmVisible,
    isLoggingOut,
    requestLogout,
    cancelLogout,
    confirmLogout,
  } = useReconsentScreen();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.title}>{AUTH_COPY.reconsent.title}</Text>
        <Text style={styles.description}>{AUTH_COPY.reconsent.description}</Text>

        <View style={styles.list}>
          <Pressable
            style={styles.agreeAll}
            onPress={toggleAll}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isAllChecked }}
            accessibilityLabel={AUTH_COPY.consent.agreeAll}
          >
            <View style={[styles.circle, isAllChecked && styles.circleChecked]}>
              {isAllChecked ? <CheckIcon size={15} color={theme.color.onPrimary} /> : null}
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
              // 열람 문서가 있는 항목만 [보기]를 그린다 — 연령 확인은 version이 항상 null인
              // 자기 선언이라 열 문서가 없다(auth-uiux.md 4.3-1)
              onViewPress={
                item.consentType === 'terms' || item.consentType === 'privacy'
                  ? () => handleViewPress(item.consentType)
                  : undefined
              }
            />
          ))}
        </View>
      </View>

      <Pressable
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        disabled={!canSubmit || isSubmitting}
        onPress={handleSubmit}
        accessibilityRole="button"
        accessibilityLabel={AUTH_COPY.reconsent.submit}
        accessibilityState={{ disabled: !canSubmit || isSubmitting }}
      >
        {isSubmitting ? (
          <ActivityIndicator color={theme.color.onPrimary} />
        ) : (
          <Text style={styles.submitLabel}>{AUTH_COPY.reconsent.submit}</Text>
        )}
      </Pressable>

      {/* 거절 경로 — 면·테두리 없는 텍스트 버튼. 감추지는 않는다 */}
      <Pressable
        style={styles.logout}
        onPress={requestLogout}
        accessibilityRole="button"
        accessibilityLabel={AUTH_COPY.reconsent.logout}
      >
        <Text style={styles.logoutLabel}>{AUTH_COPY.reconsent.logout}</Text>
      </Pressable>

      {/* 확인 없이 세션을 끊지 않는다(auth-uiux.md 4.3-1) */}
      <ConfirmDialog
        isVisible={isLogoutConfirmVisible}
        title={AUTH_COPY.reconsent.logoutConfirmTitle}
        body={AUTH_COPY.reconsent.logoutConfirmBody}
        secondaryAction={{
          label: AUTH_COPY.reconsent.logoutCancel,
          onPress: cancelLogout,
        }}
        primaryAction={{
          label: AUTH_COPY.reconsent.logoutConfirm,
          onPress: () => {
            if (!isLoggingOut) void confirmLogout();
          },
        }}
        onCloseRequest={cancelLogout}
      />
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
    paddingTop: theme.spacing.xxl,
  },
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl * 1.3,
  },
  description: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.md * 1.5,
  },
  list: {
    marginTop: theme.spacing.xl,
  },
  agreeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  agreeAllLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.border,
    marginVertical: theme.spacing.sm,
  },
  submit: {
    minHeight: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    backgroundColor: theme.color.border,
  },
  submitLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
  logout: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  logoutLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
