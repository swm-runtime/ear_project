/**
 * Android 만 Meta SDK 광고 ID(AAID) 수집의 네이티브 기본값을 `true` 로 덮는다(KAN-118).
 *
 * 운영 SDK 는 앱 시작 즉시 네이티브로 초기화되고(`isAutoInitEnabled`) 첫 실행 이벤트
 * (`fb_mobile_first_app_launch`·`fb_mobile_activate_app`)를 **매니페스트 meta-data 값으로** 보낸다.
 * JS 의 `Settings.setAdvertiserIDCollectionEnabled`(`shared/analytics/meta.ts`)는 그 뒤에야 적용되고,
 * OTA 는 다음 실행부터라 새 설치자의 첫 세션엔 닿지 않는다 — 그래서 설치 이벤트에 광고 ID 를
 * 실으려면 네이티브 기본값을 바꿔야 한다.
 *
 * iOS 는 건드리지 않는다 — `react-native-fbsdk-next` 플러그인 옵션 `advertiserIDCollectionEnabled: false`
 * 가 `Info.plist` 의 `FacebookAdvertiserIDCollectionEnabled` 를 false 로 두고, ATT 설명문도 없다.
 *
 * **`app.json` plugins 에서 `react-native-fbsdk-next` 보다 앞에 둔다.** Expo 는 목록 뒤쪽 플러그인의
 * 매니페스트 수정을 먼저 실행하므로, 뒤에 두면 fbsdk 가 같은 키를 false 로 다시 써서 false 가 남는다
 * (2026-10-04 prebuild 실측).
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const KEY = 'com.facebook.sdk.AdvertiserIDCollectionEnabled';

module.exports = (config) =>
  withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, KEY, 'true');
    return mod;
  });
