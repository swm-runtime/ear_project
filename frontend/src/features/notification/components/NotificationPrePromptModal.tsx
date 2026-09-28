import { useState } from 'react';

import { setAnalyticsUserProperties, track } from '@/shared/analytics';
import { APP_VERSION } from '@/shared/lib/app-version';
import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';
import { theme } from '@/shared/theme';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';

import { useSyncDevicePermissionMutation } from '../hooks/useSyncDevicePermissionMutation';
import { NOTIFICATION_COPY } from '../notification.copy';
import BellIcon from './BellIcon';
import { getPushToken, requestOsPermission } from '../services/notification-permission.service';

const BELL_SIZE = 48;

interface NotificationPrePromptModalProps {
  isVisible: boolean;
  /**
   * 거부하고 닫을 때도 서버에 반영할지 — **온보딩 직후 경로만 켠다**(onboarding-api.md 4.9).
   * 그 경로의 동기화는 권한 결과 보고인 동시에 **기기 등록**이라, 거부해도 한 번은 보내야
   * 서버에 기기 행이 생긴다. 설정에서 여는 경우는 이미 등록된 기기이고 [나중에]로는
   * OS 권한이 바뀌지 않으므로 보내지 않는다.
   */
  syncOnDismiss?: boolean;
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
 * 두 곳에서 쓴다 — 설정의 유도 배너, 그리고 온보딩 직후 착지 화면.
 * **[나중에]는 되묻지 않고 바로 닫는다**(2026-09-06). 되짚기 팝업은 폐지했다.
 */
export default function NotificationPrePromptModal({
  isVisible,
  syncOnDismiss = false,
  onFinished,
}: NotificationPrePromptModalProps) {
  const syncDeviceMutation = useSyncDevicePermissionMutation();
  const [isProcessing, setIsProcessing] = useState(false);

  /** 권한 결과를 서버에 반영하고 닫는다. 거부했을 때도 호출한다(onboarding-api.md 4.9) */
  const syncAndFinish = async (isGranted: boolean): Promise<void> => {
    setIsProcessing(true);
    try {
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

  const requestAndFinish = async (): Promise<void> => {
    setIsProcessing(true);
    try {
      const isGranted = await requestOsPermission();
      track('push_permission', {
        result: isGranted ? 'granted' : 'denied',
        source: syncOnDismiss ? 'onboarding' : 'settings',
      });
      setAnalyticsUserProperties({ push_permission: isGranted ? 'granted' : 'denied' });
      await syncAndFinish(isGranted);
    } catch (error) {
      logger.warn('[notification] permission request failed', error);
      await syncAndFinish(false);
    }
  };

  /** 권한을 요청하지 않고 닫는다 — 온보딩 경로에서는 거부 결과를 한 번 보고한다 */
  const dismiss = (): void => {
    if (syncOnDismiss) {
      void syncAndFinish(false);
      return;
    }
    onFinished();
  };

  const handleAllowPress = (): void => {
    if (isProcessing) return;
    // 온보딩 경로에서만 단계 이벤트다 — 설정에서 다시 연 프리프롬프트는 push_permission 만 남긴다
    if (syncOnDismiss) track('onboarding_step', { step: 'notification', action: 'next' });
    void requestAndFinish();
  };

  const handleLaterPress = (): void => {
    if (isProcessing) return;
    if (syncOnDismiss) track('onboarding_step', { step: 'notification', action: 'skip' });
    dismiss();
  };



  return (
    <ConfirmDialog
      isVisible={isVisible}
      icon={<BellIcon size={BELL_SIZE} color={theme.color.textPrimary} />}
      title={NOTIFICATION_COPY.prePrompt.title}
      body={NOTIFICATION_COPY.prePrompt.description}
      // 딤 탭으로 닫히지 않는다 — [나중에]가 곧 "거절"이라 온보딩 경로에선 동기화까지 딸려 있다. 뒤로가기는 [나중에]와 같다
      dismissOnBackdrop={false}
      secondaryAction={{
        label: NOTIFICATION_COPY.prePrompt.later,
        onPress: handleLaterPress,
        disabled: isProcessing,
      }}
      primaryAction={{
        label: NOTIFICATION_COPY.prePrompt.allow,
        onPress: handleAllowPress,
        isBusy: isProcessing,
      }}
      onCloseRequest={handleLaterPress}
    />
  );
}

