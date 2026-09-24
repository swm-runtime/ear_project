import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { IS_DEV_API, resolveBundleLabel } from '@/shared/lib/app-version';
import { logger } from '@/shared/lib/logger';

import type {
  AnalyticsEventName,
  AnalyticsEvents,
  AnalyticsUserProperties,
} from './analytics.events';

/**
 * 제품 분석(GA4) 진입점 — 화면·훅·서비스는 **이 파일의 `track()` 만** 부른다(KAN-90,
 * `docs/features/analytics.md`). Firebase 를 직접 부르는 곳이 여러 군데면 SDK 를 바꿀 때 다 뒤진다.
 *
 * - 웹·mock 실행에서는 no-op 이다 — 푸시 권한 스텁(`IS_OS_PERMISSION_STUBBED`)과 같은 기준.
 * - 실패해도 앱 동작에 영향이 없다: 발송 오류는 `logger.warn` 으로만 남긴다.
 * - 공통 파라미터(3.1)는 여기서 붙인다 — 호출부가 매번 챙기지 않는다.
 * - 서버 `user_signals` 와 역할이 다르다(추천 입력 vs 제품 분석). 서로 참조하지 않는다.
 */

const IS_ANALYTICS_STUBBED =
  Platform.OS === 'web' || process.env.EXPO_PUBLIC_ANALYTICS === 'mock';

type AnalyticsModule = typeof import('@react-native-firebase/analytics');
type Analytics = ReturnType<AnalyticsModule['getAnalytics']>;

let sdk: { module: AnalyticsModule; instance: Analytics } | null = null;

/** SDK 는 실사용 시점에 동적 로드한다 — 웹 번들·Expo Go 에는 네이티브 모듈이 없다 */
const getSdk = async (): Promise<typeof sdk> => {
  if (IS_ANALYTICS_STUBBED) return null;
  if (sdk) return sdk;
  try {
    const module = await import('@react-native-firebase/analytics');
    sdk = { module, instance: module.getAnalytics() };
    return sdk;
  } catch (error) {
    logger.warn('[analytics] firebase analytics unavailable', error);
    return null;
  }
};

/** 3.1 공통 파라미터 — 모든 이벤트에 자동으로 붙는다 */
const commonParams = (): Record<string, string> => {
  const label = resolveBundleLabel();
  return {
    app_variant: IS_DEV_API ? 'dev' : 'production',
    bundle_label: label === '내장' ? 'embedded' : label,
  };
};

/** 마지막으로 보낸 이벤트 이름 — 개발계 설정의 "분석 디버그" 행이 읽는다(5장) */
let lastEventName: string | null = null;
export const getLastAnalyticsEvent = (): string | null => lastEventName;

export const track = <E extends AnalyticsEventName>(
  event: E,
  params: AnalyticsEvents[E],
): void => {
  lastEventName = event;
  void (async () => {
    const loaded = await getSdk();
    if (!loaded) return;
    try {
      // `search`·`share`·`login`·`sign_up` 은 GA4 예약 이름이라 SDK 가 전용 오버로드를 갖는다 —
      // 우리 파라미터 표는 사전(analytics.events.ts)이 검사하므로 이 호출은 문자열 오버로드로 보낸다
      await loaded.module.logEvent(
        loaded.instance,
        event as string,
        { ...commonParams(), ...params } as Record<string, unknown>,
      );
    } catch (error) {
      logger.warn('[analytics] logEvent failed', event, error);
    }
  })();
};

/** 3.3 화면 전환 — 내비게이션 컨테이너가 포커스된 리프 라우트 이름이 바뀔 때만 부른다 */
export const trackScreen = (screenName: string): void => {
  // 디버그 행에서 "어느 화면"까지 보이게 — 실기기에서 라우트 판정(App.tsx focusedRouteName)을 확인하는 용도
  lastEventName = `screen_view:${screenName}`;
  void (async () => {
    const loaded = await getSdk();
    if (!loaded) return;
    try {
      await loaded.module.logScreenView(loaded.instance, {
        screen_name: screenName,
        screen_class: screenName,
      });
    } catch (error) {
      logger.warn('[analytics] logScreenView failed', error);
    }
  })();
};

/**
 * 3.2 `user_id` — 서버 id 의 SHA-256 앞 16자. 서버 id 를 그대로 보내지 않고, 해시는 앱에서 만들어
 * 서버는 모른다(7장). `null` 이면 로그아웃·탈퇴 — 다음 사용자에게 속성이 넘어가지 않게 비운다.
 */
export const setAnalyticsUser = (userId: string | null): void => {
  void (async () => {
    const loaded = await getSdk();
    if (!loaded) return;
    try {
      if (userId === null) {
        await loaded.module.setUserId(loaded.instance, null);
        await loaded.module.setUserProperties(loaded.instance, {
          tier: null,
          topic_count: null,
          push_permission: null,
        });
        return;
      }
      const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, userId);
      await loaded.module.setUserId(loaded.instance, digest.slice(0, 16));
    } catch (error) {
      logger.warn('[analytics] setUserId failed', error);
    }
  })();
};

export const setAnalyticsUserProperties = (props: Partial<AnalyticsUserProperties>): void => {
  void (async () => {
    const loaded = await getSdk();
    if (!loaded) return;
    try {
      const stringified: Record<string, string> = {};
      for (const [key, value] of Object.entries(props)) {
        if (value !== undefined) stringified[key] = String(value);
      }
      await loaded.module.setUserProperties(loaded.instance, stringified);
    } catch (error) {
      logger.warn('[analytics] setUserProperties failed', error);
    }
  })();
};
