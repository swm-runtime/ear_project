import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { IS_DEV_API, resolveBundleLabel } from '@/shared/lib/app-version';
import { logger } from '@/shared/lib/logger';

import type {
  AnalyticsEventName,
  AnalyticsEvents,
  AnalyticsUserProperties,
} from './analytics.events';
import { forwardToMeta, setMetaUser } from './meta';

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

/**
 * SDK 는 실사용 시점에 로드한다 — 웹 번들·Expo Go 에는 네이티브 모듈이 없다. 함수 안의 `require` 는
 * Metro 에서 `import()` 와 같이 첫 호출 때 평가되고, jest(CJS) 에서도 돈다(동적 import 는 vm-modules 없이는 못 돈다).
 */
const getSdk = async (): Promise<typeof sdk> => {
  if (IS_ANALYTICS_STUBBED) return null;
  if (sdk) return sdk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드(위 주석)
    const module = require('@react-native-firebase/analytics') as AnalyticsModule;
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

/**
 * 최근 발송 기록 — 개발계 설정의 "분석 디버그" 행이 읽는다(5장). 이름만이 아니라 **결과**를 남긴다:
 * 화면 이동으로 마지막 1개가 덮이고, 실패가 `logger.warn` 에만 남으면 실기기에서 진단이 안 된다(2026-09-24).
 */
export type AnalyticsDebugStatus = 'sending' | 'sent' | 'stubbed' | 'failed';
export interface AnalyticsDebugEntry {
  /** 이벤트 이름(화면 전환은 `screen_view:<화면>`) */
  label: string;
  status: AnalyticsDebugStatus;
  /** 실패 사유 — SDK 가 던진 메시지 첫 줄 */
  reason?: string;
  at: number;
}
const DEBUG_LOG_SIZE = 10;
const debugLog: AnalyticsDebugEntry[] = [];
const pushDebug = (label: string): AnalyticsDebugEntry => {
  const entry: AnalyticsDebugEntry = { label, status: 'sending', at: Date.now() };
  debugLog.unshift(entry);
  if (debugLog.length > DEBUG_LOG_SIZE) debugLog.length = DEBUG_LOG_SIZE;
  return entry;
};
const settleDebug = (entry: AnalyticsDebugEntry, status: AnalyticsDebugStatus, error?: unknown) => {
  entry.status = status;
  if (error !== undefined) entry.reason = String(error).split('\n')[0].slice(0, 160);
};
/** 최신순 사본 */
export const getAnalyticsDebugLog = (): AnalyticsDebugEntry[] => debugLog.map((e) => ({ ...e }));
/** @deprecated 디버그 행이 목록으로 바뀌었다 — 호환용 */
export const getLastAnalyticsEvent = (): string | null => debugLog[0]?.label ?? null;

/**
 * Firebase 파라미터 값은 **문자열·숫자만** 확실히 통한다. 불리언은 iOS 브리지에선 NSNumber 로 가지만
 * Android Bundle 에서는 지원 타입이 아니라 파라미터가 버려지고, 값이 undefined/NaN 이면 SDK 마다 다르다.
 * 여기서 한 번 고정해 플랫폼 차이를 없앤다: 불리언 → `'true'|'false'`, 유한 숫자 그대로, 그 외는 뺀다.
 */
export const sanitizeParams = (
  params: Record<string, unknown>,
): Record<string, string | number> => {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') out[key] = value.slice(0, 100);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value ? 'true' : 'false';
  }
  return out;
};

export const track = <E extends AnalyticsEventName>(
  event: E,
  params: AnalyticsEvents[E],
): void => {
  const entry = pushDebug(event);
  // Meta 광고 측정(KAN-94) — 대상 이벤트 셋만 골라 보낸다. GA4 와 독립이라 한쪽 실패가 다른 쪽을 막지 않는다
  void forwardToMeta(event, params);
  void (async () => {
    const loaded = await getSdk();
    if (!loaded) {
      settleDebug(entry, 'stubbed');
      return;
    }
    try {
      // `search`·`share`·`login`·`sign_up` 은 GA4 예약 이름이라 SDK 가 전용 오버로드를 갖는다 —
      // 우리 파라미터 표는 사전(analytics.events.ts)이 검사하므로 이 호출은 문자열 오버로드로 보낸다
      await loaded.module.logEvent(
        loaded.instance,
        event as string,
        sanitizeParams({ ...commonParams(), ...(params as Record<string, unknown>) }),
      );
      settleDebug(entry, 'sent');
    } catch (error) {
      settleDebug(entry, 'failed', error);
      logger.warn('[analytics] logEvent failed', event, error);
    }
  })();
};

/** 3.3 화면 전환 — 내비게이션 컨테이너가 포커스된 리프 라우트 이름이 바뀔 때만 부른다 */
export const trackScreen = (screenName: string): void => {
  // 디버그 행에서 "어느 화면"까지 보이게 — 실기기에서 라우트 판정(App.tsx focusedRouteName)을 확인하는 용도
  const entry = pushDebug(`screen_view:${screenName}`);
  void (async () => {
    const loaded = await getSdk();
    if (!loaded) {
      settleDebug(entry, 'stubbed');
      return;
    }
    try {
      await loaded.module.logScreenView(loaded.instance, {
        screen_name: screenName,
        screen_class: screenName,
      });
      settleDebug(entry, 'sent');
    } catch (error) {
      settleDebug(entry, 'failed', error);
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
    // Meta(KAN-94)도 같은 해시로 계정을 가른다 — GA4 가 스텁이어도 먼저 준다
    const userHash =
      userId === null
        ? null
        : (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, userId)).slice(0, 16);
    setMetaUser(userHash);
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
      await loaded.module.setUserId(loaded.instance, userHash);
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
