import { Platform } from 'react-native';

import { IS_DEV_API } from '@/shared/lib/app-version';
import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import type { AnalyticsEventName, AnalyticsEvents } from './analytics.events';

/**
 * Meta(페이스북·인스타그램) 광고 측정 — `react-native-fbsdk-next`(KAN-94, `docs/tickets/frontend/pending/meta-sdk-app-events.md`).
 *
 * GA4(`analytics.ts`)와 역할이 다르다: GA4 는 앱 안 퍼널 분석, 여기는 **광고 관리자가 설치·전환을 알게 하는 것**.
 * 그래서 보내는 이벤트가 셋뿐이다 — 가입 완료·온보딩 완료·계정의 첫 재생. 나머지 GA4 이벤트는 Meta 로 가지 않는다.
 *
 * - 호출 경로는 `track()` 하나다(analytics.md 2장 단일 진입점) — 화면·훅이 이 파일을 직접 부르지 않는다.
 * - **개발계 앱·웹·mock 은 끈다**(`IS_META_STUBBED`) — 테스트 이벤트가 광고 최적화 학습에 섞이면 안 된다.
 * - IDFA 는 수집하지 않는다(`advertiserIDCollectionEnabled: false`, app.json 플러그인) → ATT 팝업 없음(analytics.md 4장).
 *   iOS 성과는 Meta 집계 측정(AEM)·SKAdNetwork 로 들어오고 SDK 가 알아서 한다.
 * - 앱 실행(activate) 이벤트는 SDK 가 자동으로 기록한다(`autoLogAppEventsEnabled: true`).
 */

export const IS_META_STUBBED =
  Platform.OS === 'web' || process.env.EXPO_PUBLIC_ANALYTICS === 'mock' || IS_DEV_API;

type FbsdkModule = typeof import('react-native-fbsdk-next');
let fbsdk: FbsdkModule | null = null;

/** SDK 는 실사용 시점에 로드한다 — 웹 번들·Expo Go 에는 네이티브 모듈이 없다(analytics.ts 의 GA4 로더와 같은 이유) */
const getSdk = (): FbsdkModule | null => {
  if (IS_META_STUBBED) return null;
  if (fbsdk) return fbsdk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드(위 주석)
    const module = require('react-native-fbsdk-next') as FbsdkModule;
    // 네이티브 설정(app.json 플러그인)과 같은 값을 JS 에서도 못박는다 — 플러그인 기본값이 바뀌어도 IDFA 를 켜지 않게
    module.Settings.setAdvertiserIDCollectionEnabled(false);
    module.Settings.setAutoLogAppEventsEnabled(true);
    module.Settings.initializeSDK();
    fbsdk = module;
    return fbsdk;
  } catch (error) {
    logger.warn('[meta] fbsdk unavailable', error);
    return null;
  }
};

/** 현재 사용자의 해시(analytics.ts 가 로그인·로그아웃 때 준다) — 첫 재생을 계정 단위로 세는 열쇠 */
let currentUserHash: string | null = null;
export const setMetaUser = (userHash: string | null): void => {
  currentUserHash = userHash;
};

/**
 * 계정의 첫 재생인가 — 기기 로컬에 "이 계정은 첫 재생을 이미 보냈다"를 남긴다. 완벽한 계정 단위(다른 기기)는
 * 서버가 알아야 하지만, 광고 최적화 목표로는 기기당 1회면 충분하고 서버 계약을 늘리지 않는다
 */
const hasSentFirstPlay = async (userHash: string): Promise<boolean> => {
  try {
    const sent = await secureStorage.get(STORAGE_KEYS.META_FIRST_PLAY_SENT);
    return (sent ?? '').split(',').includes(userHash);
  } catch {
    return false;
  }
};
const markFirstPlaySent = async (userHash: string): Promise<void> => {
  try {
    const sent = await secureStorage.get(STORAGE_KEYS.META_FIRST_PLAY_SENT);
    const list = (sent ?? '').split(',').filter((v) => v.length > 0 && v !== userHash);
    list.push(userHash);
    // 오래된 계정 해시는 앞에서 버린다 — 한 기기에 계정이 수십 개일 일은 없지만 값이 무한히 자라지 않게
    await secureStorage.set(STORAGE_KEYS.META_FIRST_PLAY_SENT, list.slice(-20).join(','));
  } catch (error) {
    logger.warn('[meta] first_play mark failed', error);
  }
};

export type MetaDebugStatus = 'sent' | 'stubbed' | 'skipped' | 'failed';

/**
 * GA4 이벤트 중 Meta 로도 보낼 것만 골라 보낸다. 반환값은 개발계 디버그 행이 아니라 테스트용 —
 * 'skipped' 는 대상 이벤트가 아니거나(대부분) 첫 재생이 이미 보내진 경우
 */
export const forwardToMeta = async <E extends AnalyticsEventName>(
  event: E,
  params: AnalyticsEvents[E],
): Promise<MetaDebugStatus> => {
  if (event !== 'sign_up' && event !== 'onboarding_complete' && event !== 'play_start') {
    return 'skipped';
  }
  const sdk = getSdk();
  if (!sdk) return 'stubbed';
  try {
    const { AppEventsLogger } = sdk;
    if (event === 'sign_up') {
      const { method } = params as AnalyticsEvents['sign_up'];
      AppEventsLogger.logEvent(AppEventsLogger.AppEvents.CompletedRegistration, {
        [AppEventsLogger.AppEventParams.RegistrationMethod]: String(method),
      });
      return 'sent';
    }
    if (event === 'onboarding_complete') {
      AppEventsLogger.logEvent('onboarding_complete');
      return 'sent';
    }
    // play_start — 계정의 첫 재생 1회만 `first_play`(광고 최적화 목표 후보)
    const userHash = currentUserHash;
    if (userHash === null || (await hasSentFirstPlay(userHash))) return 'skipped';
    AppEventsLogger.logEvent('first_play');
    await markFirstPlaySent(userHash);
    return 'sent';
  } catch (error) {
    logger.warn('[meta] logEvent failed', event, error);
    return 'failed';
  }
};
