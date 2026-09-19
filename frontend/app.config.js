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
const IS_DEV_APP = process.env.APP_VARIANT === 'dev';

const DEV_APP_ID = 'dev.runtime.ear';

/**
 * 개발계 앱 전용 소셜 로그인 값. **null 이면 운영 값을 그대로 쓴다**(콘솔 등록 전 상태).
 *
 * - 구글 iOS 클라이언트는 번들 ID 에 묶여 있다 — 개발계 번들용 iOS 클라이언트를 구글 콘솔에
 *   만들기 전에는 개발계 iOS 앱의 구글 로그인이 실패한다. 만들면 ID 를 여기 넣는다.
 *   (Android 는 패키지+SHA-1 로 콘솔에서 매칭돼 앱 설정값이 없다. 서버 검증 aud 는 웹 클라이언트라 같다.)
 * - 카카오·네이버는 같은 앱 키를 쓰되 콘솔에 개발계 번들·패키지·키 해시를 추가 등록한다.
 */
const DEV_SOCIAL_AUTH = {
  googleIosClientId: null,
};

const googleIosUrlScheme = (clientId) =>
  `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`;

module.exports = ({ config }) => {
  if (!IS_DEV_APP) return config;

  const googleIosClientId =
    DEV_SOCIAL_AUTH.googleIosClientId ?? config.extra.socialAuth.googleIosClientId;

  // 공유 링크(earcast.co.kr)는 운영 앱이 받는다 — 개발계 앱은 도메인 연결을 선언하지 않는다.
  // 선언하면 AASA·assetlinks 에 개발계 앱을 올려야 하고, 한 폰에서 두 앱이 같은 링크를 다툰다.
  const { associatedDomains: _associatedDomains, ...ios } = config.ios;
  const { intentFilters: _intentFilters, ...android } = config.android;

  return {
    ...config,
    name: '이어(Preview)',
    icon: './assets/icon-dev.png',
    ios: { ...ios, bundleIdentifier: DEV_APP_ID },
    android: {
      ...android,
      package: DEV_APP_ID,
      adaptiveIcon: {
        ...android.adaptiveIcon,
        foregroundImage: './assets/android-icon-foreground-dev.png',
      },
    },
    plugins: config.plugins.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin'
        ? [plugin[0], { ...plugin[1], iosUrlScheme: googleIosUrlScheme(googleIosClientId) }]
        : plugin,
    ),
    extra: {
      ...config.extra,
      appVariant: 'dev',
      socialAuth: { ...config.extra.socialAuth, googleIosClientId },
    },
  };
};
