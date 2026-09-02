import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_VERSION } from '@/shared/lib/app-version';
import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';
import { theme } from '@/shared/theme';

import { useSyncDevicePermissionMutation } from '../hooks/useSyncDevicePermissionMutation';
import { NOTIFICATION_COPY } from '../notification.copy';
import BellIcon from './BellIcon';
import ReconsiderDialog from './ReconsiderDialog';
import { getPushToken, requestOsPermission } from '../services/notification-permission.service';

const BELL_SIZE = 48;

interface NotificationPrePromptModalProps {
  isVisible: boolean;
  /**
   * [나중에]를 눌렀을 때 **한 번만** 되짚는 팝업을 띄운다(2026-09-02 — 온보딩 O11에서 옮겨 왔다).
   * 설정에서 열 때는 사용자가 스스로 찾아온 것이라 되묻지 않는다.
   */
  withReconsider?: boolean;
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
 * 두 곳에서 쓴다 — 설정의 유도 배너, 그리고 온보딩 직후 라이브러리 진입(withReconsider).
 */
export default function NotificationPrePromptModal({
  isVisible,
  withReconsider = false,
  onFinished,
}: NotificationPrePromptModalProps) {
  const syncDeviceMutation = useSyncDevicePermissionMutation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReconsiderVisible, setIsReconsiderVisible] = useState(false);
  /** 되짚기는 한 번뿐이다 — 소진되면 [나중에]가 곧바로 닫는다 */
  const [isReconsiderConsumed, setIsReconsiderConsumed] = useState(false);

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
    if (withReconsider && !isReconsiderConsumed) {
      setIsReconsiderConsumed(true);
      setIsReconsiderVisible(true);
      return;
    }
    onFinished();
  };

  const handleReconsiderAllowPress = (): void => {
    setIsReconsiderVisible(false);
    void requestAndFinish();
  };

  /** [괜찮아요] — OS 다이얼로그를 띄우지 않는다. 한 번뿐인 거부 기회를 소진하지 않기 위해서다 */
  const handleReconsiderDeclinePress = (): void => {
    setIsReconsiderVisible(false);
    onFinished();
  };

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={handleLaterPress}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <View accessibilityElementsHidden importantForAccessibility="no">
            <BellIcon size={BELL_SIZE} color={theme.color.textPrimary} />
          </View>
          <Text style={styles.title}>{NOTIFICATION_COPY.prePrompt.title}</Text>
          <Text style={styles.description}>{NOTIFICATION_COPY.prePrompt.description}</Text>

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

        <ReconsiderDialog
          isVisible={isReconsiderVisible}
          onAllowPress={handleReconsiderAllowPress}
          onDeclinePress={handleReconsiderDeclinePress}
          // 뒤로가기는 팝업만 닫고 사전 안내에 머문다 — 노출 이력은 소진 상태를 유지한다
          onCloseRequest={() => setIsReconsiderVisible(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // 화면을 채우지 않는다 — 라이브러리 위에 겹쳐 뜨는 중앙 다이얼로그다(2026-09-02).
  // 전체 화면이면 온보딩의 한 단계처럼 읽혀 "끝났는데 또 나오네"가 된다
  backdrop: {
    flex: 1,
    backgroundColor: theme.color.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  dialog: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.background,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
    textAlign: 'center',
    lineHeight: theme.font.size.md * 1.4,
  },
  description: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
    lineHeight: theme.font.size.sm * 1.5,
  },
  dock: {
    alignSelf: 'stretch',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
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
