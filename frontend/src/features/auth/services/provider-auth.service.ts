import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { IS_PROVIDER_AUTH_MOCKED } from '../auth.constants';
import type { SocialProvider } from '../auth.types';

/** 사용자가 제공자 인증 창에서 취소한 경우 — 실패가 아니므로 에러 UI를 띄우지 않는다(auth-uiux.md 4.2) */
export class ProviderAuthCancelledError extends Error {
  constructor() {
    super('provider auth cancelled by user');
    this.name = 'ProviderAuthCancelledError';
  }
}

/** 제공자 인증 결과 — 그대로 서버 검증(auth-api.md 4.1)의 입력이 된다 */
export interface ProviderAuthResult {
  /** 구글=ID 토큰(JWT) · 카카오/네이버=액세스 토큰 · 애플=identity token(JWT) */
  providerToken: string;
  /** 애플 전용 — 인가 요청에 SHA-256 해시를 실은 **원본** nonce(auth-api.md 4.1) */
  nonce?: string;
}

/* ── 앱 키 — 배포 불가피한 클라이언트 키만 app config로 관리한다(architecture.md 9.1) ── */

interface SocialAuthKeys {
  googleWebClientId: string;
  googleIosClientId: string;
  kakaoNativeAppKey: string;
  /** 애플 웹 플로우(안드로이드)의 client_id — 앱 번들 ID가 아니라 Services ID다 */
  appleServicesId: string;
  appleRedirectUri: string;
  naverAppName: string;
  naverConsumerKey: string;
  naverConsumerSecret: string;
  naverServiceUrlScheme: string;
}

const getSocialAuthKeys = (): SocialAuthKeys => {
  const keys = Constants.expoConfig?.extra?.socialAuth as SocialAuthKeys | undefined;
  if (!keys) {
    throw new Error('social auth keys missing — app.json extra.socialAuth를 확인한다');
  }
  return keys;
};

/** 네이티브 모듈 reject의 code 필드를 안전하게 꺼낸다(제공자별 취소 판정용) */
const getNativeErrorCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
};

/* ── 제공자별 인증 — SDK는 실사용 시점에만 동적 로드한다(Expo Go에는 네이티브 모듈이 없다) ── */

let isGoogleConfigured = false;

/** 구글 — ID 토큰을 보낸다. 서버는 aud=웹 클라이언트 ID로 검증한다(백엔드 합의 값) */
const authenticateWithGoogle = async (): Promise<ProviderAuthResult> => {
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  if (!isGoogleConfigured) {
    const keys = getSocialAuthKeys();
    // webClientId가 있어야 idToken이 발급된다. configure는 signIn 전에 필수다
    GoogleSignin.configure({
      webClientId: keys.googleWebClientId,
      iosClientId: keys.googleIosClientId,
    });
    isGoogleConfigured = true;
  }
  // Android에서 Play Services 확인(미지원 기기는 여기서 던진다). iOS는 항상 통과
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  // 취소는 에러가 아니라 반환값으로 온다(v13+ — statusCodes에 SIGN_IN_CANCELLED가 없다)
  if (response.type === 'cancelled') throw new ProviderAuthCancelledError();
  const idToken = response.data.idToken;
  if (!idToken) throw new Error('google sign-in returned no id token');
  return { providerToken: idToken };
};

let isKakaoInitialized = false;

/** 카카오 — 카카오톡 앱 로그인, 미설치면 계정(웹) 로그인 자동 폴백(auth.md 7) */
const authenticateWithKakao = async (): Promise<ProviderAuthResult> => {
  const { initializeKakaoSDK } = await import('@react-native-kakao/core');
  const { login } = await import('@react-native-kakao/user');
  if (!isKakaoInitialized) {
    initializeKakaoSDK(getSocialAuthKeys().kakaoNativeAppKey);
    isKakaoInitialized = true;
  }
  try {
    const token = await login();
    return { providerToken: token.accessToken };
  } catch (error) {
    // 카카오 SDK enum 이름이 code로 그대로 온다 — 사용자 취소는 Cancelled
    if (getNativeErrorCode(error) === 'Cancelled') throw new ProviderAuthCancelledError();
    throw error;
  }
};

let isNaverInitialized = false;

/** 네이버 — 네이버앱 인증, 미설치면 인앱 브라우저 로그인 자동 폴백(auth.md 7) */
const authenticateWithNaver = async (): Promise<ProviderAuthResult> => {
  const { default: NaverLogin } = await import('@react-native-seoul/naver-login');
  if (!isNaverInitialized) {
    const keys = getSocialAuthKeys();
    NaverLogin.initialize({
      appName: keys.naverAppName,
      consumerKey: keys.naverConsumerKey,
      // SDK 구조상 앱에 실리는 불가피 키다 — 백엔드 합의 사항(architecture.md 9.1)
      consumerSecret: keys.naverConsumerSecret,
      // 인증 결과 복귀 스킴 — 개발자센터 iOS 환경·config plugin(urlScheme)과 같은 값이어야 한다
      serviceUrlSchemeIOS: keys.naverServiceUrlScheme,
    });
    isNaverInitialized = true;
  }
  // 실패·취소도 reject가 아니라 isSuccess=false로 resolve된다
  const { isSuccess, successResponse, failureResponse } = await NaverLogin.login();
  if (!isSuccess || !successResponse) {
    if (failureResponse?.isCancel) throw new ProviderAuthCancelledError();
    throw new Error(`naver sign-in failed: ${failureResponse?.message ?? 'unknown'}`);
  }
  return { providerToken: successResponse.accessToken };
};

/**
 * 애플(iOS) — identity token + 원본 nonce를 함께 보낸다(auth-api.md 4.1).
 * expo-apple-authentication은 nonce를 가공 없이 인가 요청에 싣는다(네이티브 소스 확인).
 * 따라서 해시는 여기서 만든다: 원본 → SHA-256 해시를 요청에, 원본을 서버에.
 * 이메일·이름은 최초 인가 때 한 번만 온다 — 저장은 identity token을 받은 서버 책임이다(auth.md 4.1).
 */
const authenticateWithAppleNative = async (): Promise<ProviderAuthResult> => {
  const AppleAuthentication = await import('expo-apple-authentication');
  const Crypto = await import('expo-crypto');
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new Error('apple sign-in returned no identity token');
    return { providerToken: credential.identityToken, nonce: rawNonce };
  } catch (error) {
    if (getNativeErrorCode(error) === 'ERR_REQUEST_CANCELED') throw new ProviderAuthCancelledError();
    throw error;
  }
};

/** 복귀 딥링크 주소 — app.json `scheme`("ear")·랜딩 콜백과 한 몸이다(티켓 확정 2026-08-26) */
const APPLE_WEB_RETURN_URL = 'ear://auth/apple';

/** RN의 URL 폴리필은 searchParams를 지원하지 않아 쿼리를 직접 파싱한다 */
const parseQueryParams = (url: string): Record<string, string> => {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return {};
  const params: Record<string, string> = {};
  for (const pair of url.slice(queryStart + 1).split('&')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    params[decodeURIComponent(pair.slice(0, separator))] = decodeURIComponent(
      pair.slice(separator + 1),
    );
  }
  return params;
};

/**
 * 애플(안드로이드) — 네이티브 SDK가 iOS 전용이라 웹 OAuth로 간다
 * (tickets: apple-android-web-oauth-app-flow, 규약 확정 2026-08-26).
 * 애플은 등록된 HTTPS Return URL로만 form_post하므로 랜딩 콜백(비밀값 없는 중계기)이
 * 받아 `ear://auth/apple?id_token=...`으로 앱에 직송한다. client_id는 번들 ID가 아니라
 * Services ID다(서버 aud 분기 — auth-api.md 4.1).
 *
 * **원본 nonce는 앱 메모리에만 둔다 — 이 설계의 안전성이 통째로 여기 걸려 있다.**
 * authorize에는 SHA-256 소문자 hex 해시만 싣는다. 악성 앱이 `ear://` 스킴을 가로채
 * id_token을 훔쳐도 원본 nonce가 없어 로그인에 쓸 수 없다(티켓 요청 4).
 */
const authenticateWithAppleWeb = async (): Promise<ProviderAuthResult> => {
  const WebBrowser = await import('expo-web-browser');
  const Crypto = await import('expo-crypto');
  const keys = getSocialAuthKeys();
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  // 복귀 딥링크가 이 요청의 응답인지 대조한다 — 다른 시도의 늦은 콜백을 배제
  const state = Crypto.randomUUID();
  const authorizeUrl =
    'https://appleid.apple.com/auth/authorize' +
    `?client_id=${encodeURIComponent(keys.appleServicesId)}` +
    `&redirect_uri=${encodeURIComponent(keys.appleRedirectUri)}` +
    '&response_type=code%20id_token' +
    '&response_mode=form_post' +
    '&scope=name%20email' +
    `&nonce=${hashedNonce}` +
    `&state=${state}`;

  const session = await WebBrowser.openAuthSessionAsync(authorizeUrl, APPLE_WEB_RETURN_URL);
  // 브라우저를 그냥 닫고 돌아온 것도 취소다 — 무반응 복귀(auth-uiux.md 4.2)
  if (session.type !== 'success') throw new ProviderAuthCancelledError();

  const params = parseQueryParams(session.url);
  // 취소·실패도 같은 딥링크의 error 쿼리로 온다 — 문구 판단은 앱 몫(티켓 확정 규약)
  if (params.error === 'user_cancelled_authorize') throw new ProviderAuthCancelledError();
  if (params.error !== undefined) throw new Error(`apple web sign-in failed: ${params.error}`);
  if (params.state !== state) throw new Error('apple web sign-in state mismatch');
  if (!params.id_token) throw new Error('apple web sign-in returned no id token');
  return { providerToken: params.id_token, nonce: rawNonce };
};

const authenticateWithApple = (): Promise<ProviderAuthResult> =>
  Platform.OS === 'ios' ? authenticateWithAppleNative() : authenticateWithAppleWeb();

/* ── mock — 제공자 SDK 대역. 서버 대역은 api/auth.mock.ts가 따로 맡는다 ── */

const MOCK_SCENARIO = process.env.EXPO_PUBLIC_PROVIDER_AUTH_MOCK_SCENARIO ?? 'default';
/** 제공자 인증 창 전환의 체감을 재현하는 지연 */
const MOCK_AUTH_DELAY_MS = 400;

/**
 * 시나리오(EXPO_PUBLIC_PROVIDER_AUTH_MOCK_SCENARIO):
 * - (기본)  성공 — 가짜 provider_token 반환(애플은 가짜 nonce 포함)
 * - cancel  사용자 취소 — A1 무反응 복귀(auth-uiux.md 4.2) 확인용
 */
const mockAuthenticate = async (provider: SocialProvider): Promise<ProviderAuthResult> => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_AUTH_DELAY_MS));
  if (MOCK_SCENARIO === 'cancel') throw new ProviderAuthCancelledError();
  return {
    providerToken: `dev-provider-token-${provider}`,
    ...(provider === 'apple' && { nonce: 'dev-nonce' }),
  };
};

/* ── 진입점 — mock 분기는 여기 한 곳에서만 한다 ── */

export const authenticateWithProvider = async (
  provider: SocialProvider,
): Promise<ProviderAuthResult> => {
  if (IS_PROVIDER_AUTH_MOCKED) return mockAuthenticate(provider);
  switch (provider) {
    case 'google':
      return authenticateWithGoogle();
    case 'kakao':
      return authenticateWithKakao();
    case 'naver':
      return authenticateWithNaver();
    case 'apple':
      return authenticateWithApple();
  }
};
