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
 * - 이벤트 호출 경로는 `track()` 하나다(analytics.md 2장 단일 진입점) — 화면·훅이 이 파일을 직접 부르지 않는다.
 *   설정의 "광고 측정 허용" 토글도 `@/shared/analytics` 공개 API(index.ts)로만 닿는다.
 * - **개발계 앱·웹·mock 은 끈다**(`IS_META_STUBBED`) — 테스트 이벤트가 광고 최적화 학습에 섞이면 안 된다.
 *   이때도 토글의 저장·표시는 동작하고 SDK 호출만 건너뛴다.
 * - iOS IDFA 는 수집하지 않는다. Android 는 광고 ID 수집을 켠다 — 네이티브 기본값(매니페스트,
 *   `plugins/with-android-meta-advertiser-id.js` — KAN-118)과 JS 초기화가 같은 값(true)을 가리킨다.
 *   iOS 성과는 Meta 집계 측정(AEM)·SKAdNetwork 로 들어오고 SDK 가 알아서 한다.
 * - 앱 실행(activate) 이벤트는 SDK 가 자동으로 기록한다(`autoLogAppEventsEnabled: true`) — 단 사용자가 광고 측정을
 *   끄면(KAN-217) 자동 기록·광고 ID 수집을 끈다(아래 "광고 측정 허용").
 */

export const IS_META_STUBBED =
  Platform.OS === 'web' || process.env.EXPO_PUBLIC_ANALYTICS === 'mock' || IS_DEV_API;

type FbsdkModule = typeof import('react-native-fbsdk-next');
let fbsdk: FbsdkModule | null = null;

/*
 * ── 광고 측정 허용(설정 토글, KAN-217) ──
 *
 * 끄면 ① 이 파일이 보내던 세 이벤트를 보내지 않고 ② SDK 의 자동 이벤트(앱 실행·설치)와 광고 ID 수집을 끈다.
 *
 * **다음 실행에서 JS 가 뜨기 전에도 꺼져 있는 근거** — 운영 앱은 네이티브 SDK 가 JS 보다 먼저 자동 초기화되고
 * (`isAutoInitEnabled: true`) 앱 실행 이벤트를 보낸다. 그래서 JS 에서 다시 끄는 것만으로는 늦다. 하지만 아래 두 setter 는
 * SDK 가 **기기에 영구 저장하고, 다음 실행에서 Info.plist·매니페스트 값보다 먼저 읽는다**(2026-10-16 SDK 18.x 소스로 확인):
 * - iOS(FBSDKCoreKit 18.x) — `Settings.setPersistedBooleanProperty` 가 `dataStore`(= `UserDefaults.standard`,
 *   `CoreKitComponents`)에 `FacebookAutoLogAppEventsEnabled`·`FacebookAdvertiserIDCollectionEnabled` 키로 쓰고,
 *   `getPersistedBooleanProperty`·`Settings+AutoLogAppEvents.checkClientSideConfiguration` 은 UserDefaults → Info.plist
 *   순으로 읽는다. 브리지는 `RCTFBSDKSettings.m` 의 `setIsAutoLogAppEventsEnabled`·`setIsAdvertiserIDCollectionEnabled`.
 * - Android(facebook-core 18.x) — `UserSettingsManager.setAutoLogAppEventsEnabled`·`setAdvertiserIDCollectionEnabled` 가
 *   `writeSettingToCache` 로 SharedPreferences `com.facebook.sdk.USER_SETTINGS` 에 쓰고, `initializeUserSetting` 은
 *   `readSettingFromCache` 가 비었을 때만 `loadSettingFromManifest` 로 간다. 브리지는 `FBSettingsModule.java`(FacebookSdk.set…).
 * 그래서 네이티브 플러그인 값(app.json)을 바꾸지 않고 OTA 로 끝난다. 남는 것: 값을 바꾸는 순간 SDK 가 내부 진단 이벤트
 * (`fb_sdk_settings_changed` — 설정 비트마스크만)를 한 번 보낼 수 있다. 앱 사용 이벤트가 아니다.
 */

/** 기억된 허용 값 — 앱 시작 때 저장 값을 읽기 전까지는 기본값(켜짐) */
let isAdMeasurementAllowed = true;
let preferenceLoad: Promise<boolean> | null = null;

const AD_MEASUREMENT_OFF = '0';
const AD_MEASUREMENT_ON = '1';

/**
 * SDK 설정을 허용 값에 맞춘다. 켜짐은 종전 값 그대로 — 광고 ID 는 Android true(매니페스트 플러그인, KAN-118)·iOS false
 * (IDFA 미수집), 자동 이벤트 true. 꺼짐은 둘 다 false
 */
const applySdkSettings = (sdk: FbsdkModule, allowed: boolean): void => {
  sdk.Settings.setAdvertiserIDCollectionEnabled(allowed && Platform.OS === 'android');
  sdk.Settings.setAutoLogAppEventsEnabled(allowed);
};

/** SDK 는 실사용 시점에 로드한다 — 웹 번들·Expo Go 에는 네이티브 모듈이 없다(analytics.ts 의 GA4 로더와 같은 이유) */
const getSdk = (): FbsdkModule | null => {
  if (IS_META_STUBBED) return null;
  if (fbsdk) return fbsdk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드(위 주석)
    const module = require('react-native-fbsdk-next') as FbsdkModule;
    // 초기화 전에 허용 값부터 맞춘다 — 저장 값을 따른다(종전에는 매번 자동 이벤트 true)
    applySdkSettings(module, isAdMeasurementAllowed);
    module.Settings.initializeSDK();
    fbsdk = module;
    return fbsdk;
  } catch (error) {
    logger.warn('[meta] fbsdk unavailable', error);
    return null;
  }
};

/** 허용 값을 SDK 에 반영한다 — 처음 로드면 getSdk 가 이미 맞췄으므로 다시 부르지 않는다. 스텁이면 아무것도 안 한다 */
const syncSdkSettings = (allowed: boolean): void => {
  const wasLoaded = fbsdk !== null;
  const sdk = getSdk();
  if (!sdk || !wasLoaded) return;
  try {
    applySdkSettings(sdk, allowed);
  } catch (error) {
    logger.warn('[meta] apply ad measurement setting failed', error);
  }
};

/**
 * 앱 시작 때 한 번 — 저장 값을 읽어 기억하고 SDK 설정을 맞춘다(bootstrap). 여러 번 불러도 한 번만 읽는다.
 * 읽기에 실패하면 **켜짐**(기본값)으로 본다. `forwardToMeta` 도 이 결과를 기다린 뒤 판정한다(시작 직후 이벤트의 경합 방지)
 */
export const syncAdMeasurementPreference = (): Promise<boolean> => {
  preferenceLoad ??= (async () => {
    let allowed = true;
    try {
      allowed =
        (await secureStorage.get(STORAGE_KEYS.META_AD_MEASUREMENT_ALLOWED)) !== AD_MEASUREMENT_OFF;
    } catch (error) {
      logger.warn('[meta] ad measurement preference read failed', error);
    }
    isAdMeasurementAllowed = allowed;
    syncSdkSettings(allowed);
    return allowed;
  })();
  return preferenceLoad;
};

/** 지금 기억된 허용 값 — 설정 화면의 초기 표시(시작 때 읽은 값). 정확한 값은 `syncAdMeasurementPreference()` */
export const getAdMeasurementAllowed = (): boolean => isAdMeasurementAllowed;

/**
 * 토글 — 저장한 뒤 즉시 SDK 에 반영한다. 저장에 실패하면 아무것도 바꾸지 않고 `false` 를 돌려준다(화면이 원복·안내).
 * 개발계 앱·웹·mock 은 저장만 하고 SDK 는 건드리지 않는다
 */
export const setAdMeasurementAllowed = async (allowed: boolean): Promise<boolean> => {
  // 시작 때 읽기가 아직 안 끝났으면 기다린다 — 늦게 끝난 읽기가 방금 바꾼 값을 덮지 않게
  await syncAdMeasurementPreference();
  try {
    await secureStorage.set(
      STORAGE_KEYS.META_AD_MEASUREMENT_ALLOWED,
      allowed ? AD_MEASUREMENT_ON : AD_MEASUREMENT_OFF,
    );
  } catch (error) {
    logger.warn('[meta] ad measurement preference write failed', error);
    return false;
  }
  isAdMeasurementAllowed = allowed;
  preferenceLoad = Promise.resolve(allowed);
  syncSdkSettings(allowed);
  return true;
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

export type MetaDebugStatus = 'sent' | 'stubbed' | 'skipped' | 'opted_out' | 'failed';

/**
 * GA4 이벤트 중 Meta 로도 보낼 것만 골라 보낸다. 반환값은 개발계 디버그 행이 아니라 테스트용 —
 * 'skipped' 는 대상 이벤트가 아니거나(대부분) 첫 재생이 이미 보내진 경우, 'opted_out' 은 사용자가 설정에서
 * 광고 측정을 끈 경우(KAN-217 — 첫 재생 기록도 남기지 않는다)
 */
export const forwardToMeta = async <E extends AnalyticsEventName>(
  event: E,
  params: AnalyticsEvents[E],
): Promise<MetaDebugStatus> => {
  if (event !== 'sign_up' && event !== 'onboarding_complete' && event !== 'play_start') {
    return 'skipped';
  }
  if (IS_META_STUBBED) return 'stubbed';
  if (!(await syncAdMeasurementPreference())) return 'opted_out';
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
