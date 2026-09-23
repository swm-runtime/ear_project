/**
 * 빌드 변형(variant) — **운영 앱과 개발계 앱을 서로 다른 앱으로 만든다.**
 *
 * 개발계 앱(`APP_VARIANT=dev`)은 번들 ID·이름·아이콘이 달라 운영 앱과 한 폰에 같이 깔린다.
 * 같은 번들 ID 로 두면 나중에 깐 쪽이 먼저 깐 쪽을 덮어, 개발계에서 볼 것을 운영에서 보고
 * "안 고쳐졌다"고 착각한다(KAN-65 · KAN-76).
 *
 * **운영 설정의 원본은 `app.json` 이다.** `APP_VARIANT` 가 `dev` 가 아니면 이 파일은 아무것도
 * 바꾸지 않는다 — 운영 바이너리가 이 파일 때문에 달라지는 일이 없어야 한다.
 *
 * `APP_VARIANT` 를 주는 곳은 둘이다 — 둘이 어긋나면 네이티브(빌드)와 JS(OTA)의 설정이 갈린다.
 * - 빌드: `eas.json` 의 preview 계열 프로필 env
 * - OTA: `.github/workflows/eas-update.yml` 의 preview 채널 발행(`extra.socialAuth` 는 OTA
 *   매니페스트로 전달된다 — `Constants.expoConfig`)
 */
const { withInfoPlist } = require('expo/config-plugins');

const IS_DEV_APP = process.env.APP_VARIANT === 'dev';

const DEV_APP_ID = 'dev.runtime.ear';

/**
 * 개발계 앱 전용 소셜 로그인 값. **null 이면 운영 값을 그대로 쓴다**(콘솔 등록 전 상태).
 *
 * - 구글 iOS 클라이언트는 번들 ID 에 묶여 있다 — 개발계 번들용 iOS 클라이언트를 구글 콘솔에
 *   만들기 전에는 개발계 iOS 앱의 구글 로그인이 실패한다. 만들면 ID 를 여기 넣는다.
 *   (Android 는 패키지+SHA-1 로 콘솔에서 매칭돼 앱 설정값이 없다. 서버 검증 aud 는 웹 클라이언트라 같다.)
 * - **카카오 앱 키는 패키지명·번들 ID 에 묶인다.** 운영 키를 그대로 쓰면 개발계 앱
 *   (`dev.runtime.ear`)의 로그인이 거부된다 — 콘솔에 개발계 패키지·키 해시를 등록해도
 *   소용없다. 앱이 내미는 키 자체가 운영 키이기 때문이다(2026-09-20, APK 매니페스트의
 *   `kakaoe1f65f…` 로 확인). 그래서 개발계 전용 네이티브 앱 키를 따로 받아 쓴다.
 * - 네이버는 클라이언트 ID 가 패키지·번들에 묶이지 않아 같은 키를 그대로 쓴다. 콘솔에
 *   Android 패키지만 추가 등록하면 된다(iOS 는 URL 스킴이 같아 등록 없이도 동작한다).
 */
const DEV_SOCIAL_AUTH = {
  googleIosClientId:
    '475643832949-8p18o9514dniv3i3lanh45o14nubda0a.apps.googleusercontent.com',
  kakaoNativeAppKey: 'a67198ac1a489d5d2d3099e8f098a570',
};

const googleIosUrlScheme = (clientId) =>
  `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`;

/**
 * iOS 번들 이름(CFBundleName)을 고정한다.
 *
 * Expo 는 앱 이름에서 ASCII 만 남겨 PRODUCT_NAME·CFBundleName 을 만든다 — "이어 - preview" 는
 * **"preview"** 가 되고, 이는 애플 기본 앱 "미리보기(Preview)"와 같아 App Store Connect 가
 * `ITMS-90129: bundle name or display name that is already taken` 으로 빌드를 거부한다
 * (2026-09-19, 빌드 2·3 연속 실패). 홈 화면 이름(CFBundleDisplayName)은 그대로 둔다.
 */
const DEV_BUNDLE_NAME = 'EarPreview';
const withDevBundleName = (config) =>
  withInfoPlist(config, (mod) => {
    mod.modResults.CFBundleName = DEV_BUNDLE_NAME;
    return mod;
  });

/**
 * Sentry DSN — 비밀은 아니지만(클라이언트에 실리는 값) 소스에 박지 않고 env 로 받는다(KAN-92).
 * `eas.json` 프로필 env · `eas-update.yml` 에서 `SENTRY_DSN` 으로 준다. 없으면 빈 문자열 →
 * 앱은 초기화를 건너뛰고 아무것도 보내지 않는다(DSN 발급 전·로컬 실행).
 * 운영·개발계는 같은 DSN 을 쓰고 `environment` 로 가른다(`shared/monitoring/sentry.ts`).
 */
const SENTRY_DSN = process.env.SENTRY_DSN ?? '';

module.exports = ({ config }) => {
  const withDsn = { ...config, extra: { ...config.extra, sentryDsn: SENTRY_DSN } };
  if (!IS_DEV_APP) return withDsn;
  config = withDsn;

  const googleIosClientId =
    DEV_SOCIAL_AUTH.googleIosClientId ?? config.extra.socialAuth.googleIosClientId;
  const kakaoNativeAppKey =
    DEV_SOCIAL_AUTH.kakaoNativeAppKey ?? config.extra.socialAuth.kakaoNativeAppKey;

  // 공유 링크(earcast.co.kr)는 운영 앱이 받는다 — 개발계 앱은 도메인 연결을 선언하지 않는다.
  // 선언하면 AASA·assetlinks 에 개발계 앱을 올려야 하고, 한 폰에서 두 앱이 같은 링크를 다툰다.
  const { associatedDomains: _associatedDomains, ...ios } = config.ios;
  const { intentFilters: _intentFilters, ...android } = config.android;

  return withDevBundleName({
    ...config,
    // App Store Connect 에 등록한 앱 이름과 같게 둔다 — 다르면 업로드가 ITMS-90129
    // ("display name that is already taken")로 거부된다(2026-09-19, "이어 - preview" 로 올렸다가 실패)
    name: '이어 - preview',
    icon: './assets/icon-dev.png',
    // Firebase iOS 설정은 번들 ID 마다 파일이 다르다(Android 는 한 파일에 둘 다 들어간다) — KAN-90
    ios: { ...ios, bundleIdentifier: DEV_APP_ID, googleServicesFile: './GoogleService-Info.dev.plist' },
    android: {
      ...android,
      package: DEV_APP_ID,
      adaptiveIcon: {
        ...android.adaptiveIcon,
        foregroundImage: './assets/android-icon-foreground-dev.png',
      },
    },
    // 네이티브 값이라 여기서 덮어야 한다 — 구글은 iOS URL 스킴, 카카오는 `kakao<앱키>` 스킴이
    // 매니페스트·Info.plist 에 박힌다. `extra` 만 바꾸면 스킴과 SDK 초기화 값이 갈린다
    plugins: config.plugins.map((plugin) => {
      if (!Array.isArray(plugin)) return plugin;

      if (plugin[0] === '@react-native-google-signin/google-signin') {
        return [
          plugin[0],
          { ...plugin[1], iosUrlScheme: googleIosUrlScheme(googleIosClientId) },
        ];
      }

      if (plugin[0] === '@react-native-kakao/core') {
        return [plugin[0], { ...plugin[1], nativeAppKey: kakaoNativeAppKey }];
      }

      return plugin;
    }),
    extra: {
      ...config.extra,
      appVariant: 'dev',
      socialAuth: {
        ...config.extra.socialAuth,
        googleIosClientId,
        // `provider-auth.service.ts` 의 `initializeKakaoSDK` 가 읽는다 — 위 플러그인 값과 같아야 한다
        kakaoNativeAppKey,
      },
    },
  });
};
