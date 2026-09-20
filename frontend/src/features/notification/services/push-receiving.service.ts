import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import { logger } from '@/shared/lib/logger';

import { IS_OS_PERMISSION_STUBBED } from '../notification.constants';
import { parsePushData } from './push-link';
import { useNotificationStore } from '../store/notification.store';

/**
 * 푸시 수신·탭(notification.md 4.4·4.5). React 트리 밖에서 듣는다 — 콜드 스타트의 탭은
 * 화면이 하나도 뜨기 전에 도착하고, 관문(스플래시·온보딩)을 지나는 동안 살아 있어야 한다.
 *
 * 여기서는 **목적지를 적어 두기만 한다.** 이동은 Main 이 뜬 뒤 `usePushLinkGate`가 한다 —
 * 딥링크는 도착지가 결정된 뒤 스택 위에 얹는다(architecture.md 6.4).
 */

interface PushReceivingOptions {
  /**
   * 포그라운드에서 도착 통지를 받았을 때 — 라이브러리 목록을 조용히 갱신한다.
   * notification이 library의 쿼리 키를 알지 않도록 bootstrap이 주입한다(architecture.md 4.3).
   */
  onForegroundArrival: () => void;
}

let isStarted = false;
/** 같은 탭을 두 번 처리하지 않는다 — 콜드 스타트는 리스너와 마지막 응답 조회 양쪽으로 온다 */
let lastHandledResponseId: string | null = null;

const handleResponse = (response: Notifications.NotificationResponse): void => {
  const id = `${response.notification.request.identifier}:${response.notification.date}`;
  if (id === lastHandledResponseId) return;
  lastHandledResponseId = id;

  const arrival = parsePushData(response.notification.request.content.data);
  if (arrival === null) return;
  logger.debug('[notification] push tapped', arrival.target.kind);
  const store = useNotificationStore.getState();
  // 탭해서 들어왔으면 같은 통지의 인앱 배너는 더 띄울 이유가 없다
  store.hideForegroundArrival();
  store.setPendingPushTarget(arrival.target);
};

export const startPushReceiving = (options: PushReceivingOptions): void => {
  if (isStarted || IS_OS_PERMISSION_STUBBED) return;
  isStarted = true;

  /*
   * 포그라운드의 드립 도착은 OS 배너를 띄우지 않는다 — 인앱 배너가 대신한다(4.5).
   * 알림 센터에도 남기지 않는다: 이미 앱 안에서 본 통지가 나중에 또 보이면 새 도착으로 읽힌다.
   * 우리 것이 아닌 알림은 OS 기본대로 보여 준다.
   */
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isArrival = parsePushData(notification.request.content.data) !== null;
      return {
        shouldShowBanner: !isArrival,
        shouldShowList: !isArrival,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    },
  });

  Notifications.addNotificationReceivedListener((notification) => {
    // 백그라운드에서 깨어나 받은 것은 OS 가 이미 배너를 띄웠다 — 인앱 배너는 포그라운드 전용이다
    if (AppState.currentState !== 'active') return;
    const arrival = parsePushData(notification.request.content.data);
    if (arrival === null) return;
    useNotificationStore.getState().showForegroundArrival(arrival);
    options.onForegroundArrival();
  });

  Notifications.addNotificationResponseReceivedListener(handleResponse);

  // 콜드 스타트 — 앱을 띄운 그 탭은 리스너 등록 전에 지나갔을 수 있다
  try {
    const initial = Notifications.getLastNotificationResponse();
    if (initial) {
      handleResponse(initial);
      Notifications.clearLastNotificationResponse();
    }
  } catch (error) {
    logger.warn('[notification] failed to read the launching notification', error);
  }
};

/** 로그아웃·탈퇴·세션 만료 — 앞 사용자의 목적지·배너를 다음 사용자에게 넘기지 않는다 */
export const clearPushState = (): void => {
  const store = useNotificationStore.getState();
  store.clearPendingPushTarget();
  store.hideForegroundArrival();
};
