import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';

import ReconsiderDialog from '../components/ReconsiderDialog';
import { useNotificationPermissionScreen } from '../hooks/useNotificationPermissionScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';

/**
 * O10 알림 사전 안내(프리퍼미션). OS 다이얼로그는 [알림 받기]에서만 띄운다(onboarding-uiux.md 4.7).
 * [나중에]는 주 액션보다 약한 스타일로 두되 감추지 않는다 — 되짚을 기회(O11)가 한 번 더 남아 있다.
 */
export default function NotificationPermissionScreen() {
  const {
    isDialogVisible,
    isFinishing,
    handleAllowPress,
    handleLaterPress,
    handleDialogAllowPress,
    handleDialogDeclinePress,
    handleDialogCloseRequest,
  } = useNotificationPermissionScreen();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.bell} accessibilityElementsHidden importantForAccessibility="no">
          🔔
        </Text>
        <Text style={styles.title}>{ONBOARDING_COPY.notification.title}</Text>
        {/* 발송 빈도를 문구에 명시한다 — 상한을 먼저 말하는 것이 허용률에 작용한다(onboarding-uiux.md 4.7) */}
        <Text style={styles.description}>{ONBOARDING_COPY.notification.description}</Text>
      </View>

      <View style={styles.dock}>
        <Pressable
          style={styles.allow}
          disabled={isFinishing}
          onPress={handleAllowPress}
          accessibilityRole="button"
          accessibilityLabel={ONBOARDING_COPY.notification.allow}
          accessibilityState={{ disabled: isFinishing }}
        >
          {isFinishing ? (
            <ActivityIndicator color={theme.color.onPrimary} />
          ) : (
            <Text style={styles.allowLabel}>{ONBOARDING_COPY.notification.allow}</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.later}
          disabled={isFinishing}
          onPress={handleLaterPress}
          accessibilityRole="button"
          accessibilityLabel={ONBOARDING_COPY.notification.later}
          accessibilityState={{ disabled: isFinishing }}
        >
          <Text style={styles.laterLabel}>{ONBOARDING_COPY.notification.later}</Text>
        </Pressable>
      </View>

      <ReconsiderDialog
        isVisible={isDialogVisible}
        onAllowPress={handleDialogAllowPress}
        onDeclinePress={handleDialogDeclinePress}
        onCloseRequest={handleDialogCloseRequest}
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  bell: {
    fontSize: 48,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
    lineHeight: theme.font.size.sm * 1.5,
  },
  dock: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  allow: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allowLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  later: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
});
