/**
 * Metro 설정 — Sentry 가 감싼 Expo 기본 설정(KAN-95, 2026-09-24 박준현 추가 항목 3-1).
 *
 * 소스맵을 올려도 스택이 `main.jsbundle:1:…` 로만 보인 이유: 업로드가 Release·Dist 없이 가서 Sentry 가 이벤트와
 * 맵을 **Debug ID 로만** 짝짓는데, Debug ID 를 번들에 심는 건 이 Metro 설정이다. 이게 없으면 맵은 있고 번들엔
 * ID 가 없어 연결이 안 된다. `getSentryExpoConfig` 는 Expo 기본 설정을 그대로 감싸므로 다른 동작은 바뀌지 않는다.
 */
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
