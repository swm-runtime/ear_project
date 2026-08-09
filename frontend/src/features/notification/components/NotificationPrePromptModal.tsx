import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_VERSION } from '@/shared/lib/app-version';
import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';
import { theme } from '@/shared/theme';

import { useSyncDevicePermissionMutation } from '../hooks/useSyncDevicePermissionMutation';
import { NOTIFICATION_COPY } from '../notification.copy';
import { getPushToken, requestOsPermission } from '../services/notification-permission.service';

interface NotificationPrePromptModalProps {
  isVisible: boolean;
  /**
   * 사전 안내가 끝났을 때 — [알림 받기]의 권한 결정(허용·거부 모두 서버 동기화 후) 또는
   * [나중에]. 호출부는 이 시점에 OS 권한 상태를 다시 읽어 배너·토글 표시를 갱신한다
   * (자동으로 토글을 켜지 않는다 — settings-uiux.md 8장).
   */
  onFinished: () => void;
}

/**
 * 알림 사전 안내(프리퍼미션) — 설정의 유도 배너가 여는 화면이다(notification.md 4.1 (b)안).
 * OS 다이얼로그는 [알림 받기]에서만 띄운다 — 사전 안내를 건너뛰고 바로 띄우지 않는다.
 * 온보딩 O10과 문구를 공유하지만, 재고 팝업(O11)·라이브러리 진입은 온보딩만의 규칙이라 없다.
 */
export default function NotificationPrePromptModal({
  isVisible,
  onFinished,
}: NotificationPrePromptModalProps) {
  const syncDeviceMutation = useSyncDevicePermissionMutation();
  const [isProcessing, setIsProcessing] = useState(false);

  /** 권한 결과를 서버에 반영하고 닫는다. 거부했을 때도 호출한다(onboarding-api.md 4.9) */
  const requestAndFinish = async (): Promise<void> => {
    setIsProcessing(true);
    try {
      const isGranted = await requestOsPermission();
      const deviceId = await getDeviceId();
      const pushToken = isGranted ? await getPushToken() : null;
      await syncDeviceMutation.mutateAsync({
        deviceId,
        pushToken,
        isOsPermissionGranted: isGranted,
        appVersion: APP_VERSION,
      });
    } catch (error) {
      // 동기화 실패가 닫힘을 막지 않는다 — 포그라운드 복귀 동기화가 이어받는다(architecture.md 5.5)
      logger.warn('[notification] device permission sync failed', error);
    }
    setIsProcessing(false);
    onFinished();
  };

  const handleAllowPress = (): void => {
    if (isProcessing) return;
    void requestAndFinish();
  };

  const handleLaterPress = (): void => {
    if (isProcessing) return;
    onFinished();
  };

  return (
    <Modal visible={isVisible} animationType="slide" onRequestClose={handleLaterPress}>
      <View style={styles.container}>
        <View style={styles.body}>
          <Text style={styles.bell} accessibilityElementsHidden importantForAccessibility="no">
            🔔
          </Text>
          <Text style={styles.title}>{NOTIFICATION_COPY.prePrompt.title}</Text>
          <Text style={styles.description}>{NOTIFICATION_COPY.prePrompt.description}</Text>
        </View>

        <View style={styles.dock}>
          <Pressable
            style={styles.allow}
            disabled={isProcessing}
            onPress={handleAllowPress}
            accessibilityRole="button"
            accessibilityLabel={NOTIFICATION_COPY.prePrompt.allow}
            accessibilityState={{ disabled: isProcessing }}
          >
            {isProcessing ? (
              <ActivityIndicator color={theme.color.onPrimary} />
            ) : (
              <Text style={styles.allowLabel}>{NOTIFICATION_COPY.prePrompt.allow}</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.later}
            disabled={isProcessing}
            onPress={handleLaterPress}
            accessibilityRole="button"
            accessibilityLabel={NOTIFICATION_COPY.prePrompt.later}
            accessibilityState={{ disabled: isProcessing }}
          >
            <Text style={styles.laterLabel}>{NOTIFICATION_COPY.prePrompt.later}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
    paddingBottom: theme.spacing.xl,
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
