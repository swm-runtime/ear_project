export type { AnalyticsEventName, AnalyticsEvents } from './analytics.events';
export type { AnalyticsDebugEntry, AnalyticsDebugStatus } from './analytics';
export {
  getAnalyticsDebugLog,
  getLastAnalyticsEvent,
  setAnalyticsUser,
  setAnalyticsUserProperties,
  track,
  trackScreen,
} from './analytics';
// 설정 > 광고 측정 허용(KAN-217) — Meta 전송 토글. 화면·훅은 meta.ts 를 직접 부르지 않고 여기로 닿는다
export {
  getAdMeasurementAllowed,
  setAdMeasurementAllowed,
  syncAdMeasurementPreference,
} from './meta';
