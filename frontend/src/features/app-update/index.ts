/**
 * app-update feature 공개 API(convention.md 2.2) — 스플래시 버전 관문(splash.md 4.1 처리 1단계, KAN-99).
 * 판정은 서버(`GET /app/version`), 앱은 결과로 화면만 가른다. 설정 화면의 배지는 이 feature 와 무관하다
 * (종전대로 `GET /users/me/settings` 의 `version`).
 */
export { default as ForceUpdateScreen } from './screens/ForceUpdateScreen';
export { default as UpdateRecommendDialog } from './components/UpdateRecommendDialog';
export { useAppUpdateStore } from './store/app-update.store';
export { checkAppVersionGate, startAppVersionRecheck } from './services/app-update.service';
