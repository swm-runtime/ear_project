import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { BackHandler } from 'react-native';

import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';

import { APP_VERSION } from '../onboarding.constants';
import { useSyncDevicePermissionMutation } from './useSyncDevicePermissionMutation';
import {
  getPushToken,
  requestOsPermission,
} from '../services/notification-permission.service';
import { exitOnboarding } from '../services/onboarding-exit.service';
import { useOnboardingStore } from '../store/onboarding.store';

/**
 * O10 알림 사전 안내 + O11 재고 팝업.
 * OS 다이얼로그는 [알림 받기]에서만 띄운다 — 한 번 거부되면 재요청이 불가한 기회를 소진하지 않는다.
 * 허용·거부 결과와 무관하게 라이브러리로 진입한다(onboarding.md 4 [알림]).
 */
export const useNotificationPermissionScreen = () => {
  const isReconsiderConsumed = useOnboardingStore((s) => s.isReconsiderConsumed);
  const consumeReconsider = useOnboardingStore((s) => s.consumeReconsider);
  const syncDeviceMutation = useSyncDevicePermissionMutation();
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // 뒤로가기: 팝업이 떠 있으면 팝업만 닫고 화면에 머문다(노출 이력은 소진 유지 — onboarding.md 7).
  // 화면 자체의 뒤로가기는 무시한다 — O9는 이미 스택에서 제거됐다(onboarding-uiux.md 4.7)
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setIsDialogVisible(false);
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

  /** 권한 결과를 서버에 반영하고 라이브러리로 진입한다. 거부했을 때도 호출한다(onboarding-api.md 4.9) */
  const syncAndFinish = async (isGranted: boolean) => {
    setIsFinishing(true);
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
      // 동기화 실패가 라이브러리 진입을 막지 않는다 — 포그라운드 복귀 동기화가 이어받는다(architecture.md 5.5)
      logger.warn('[onboarding] device permission sync failed', error);
    }
    exitOnboarding();
  };

  const requestAndFinish = async () => {
    setIsFinishing(true);
    try {
      const isGranted = await requestOsPermission();
      await syncAndFinish(isGranted);
    } catch (error) {
      logger.warn('[onboarding] permission request failed', error);
      await syncAndFinish(false);
    }
  };

  const handleAllowPress = () => {
    if (isFinishing) return;
    void requestAndFinish();
  };

  const handleLaterPress = () => {
    if (isFinishing) return;
    // 재고 팝업은 온보딩 전체에서 1회만 뜬다 — 이미 소진됐으면 바로 진입한다(onboarding.md 4 [알림])
    if (isReconsiderConsumed) {
      void syncAndFinish(false);
      return;
    }
    consumeReconsider();
    setIsDialogVisible(true);
  };

  const handleDialogAllowPress = () => {
    setIsDialogVisible(false);
    void requestAndFinish();
  };

  /** [괜찮아요] — OS 다이얼로그를 띄우지 않는다. 거부 이력을 소진하지 않기 위해서다(onboarding-uiux.md 4.8) */
  const handleDialogDeclinePress = () => {
    setIsDialogVisible(false);
    void syncAndFinish(false);
  };

  return {
    isDialogVisible,
    isFinishing,
    handleAllowPress,
    handleLaterPress,
    handleDialogAllowPress,
    handleDialogDeclinePress,
    handleDialogCloseRequest: () => setIsDialogVisible(false),
  };
};
