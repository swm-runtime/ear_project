import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { useSyncExternalStore } from 'react';
import { DevSettings } from 'react-native';

/**
 * 표시 언어·기기 로캘·시간대(KAN-194·195 — `spec/api/global-api.md` 2.2·2.3·4.3).
 *
 * **표시 언어 = 설정에서 고른 언어, 고르지 않았으면 기기 언어**다. 기기 언어가 한국어면 `ko`, 그 밖은 전부 `en`(1단계는
 * 두 언어뿐 — RTL·추가 언어는 범위 밖). 설정 "언어"에서 바꾸면 저장하고 JS 를 다시 부른다 — 카피는 앱이 켜질 때 한 번 정해진다.
 * 고른 언어는 `expo-secure-store` 에 두고 **시작 순간 동기로** 읽는다(첫 화면부터 그 언어로 — 화면 모드 `color-mode.ts` 와 같은 방식).
 *
 * 기기 값은 JS 표준 `Intl` 로 읽는다 — Hermes 는 기기 로캘·시간대를 그대로 돌려준다. expo-localization 은 네이티브 모듈이라
 * 빌드가 필요해 이 단계에서는 쓰지 않는다(현지화 빌드 KAN-198 에서 바꿀 수 있다). 읽지 못하면 종전 동작인 한국어로 둔다.
 *
 * **시장(`users.market`) 판정이 아니다** — 시장은 가입 때 서버가 정하고 바뀌지 않는다. 표시 언어는 화면 문구와 요청 헤더
 * (로그·통계용)에만 쓴다.
 */
export type AppLanguage = 'ko' | 'en';

/** 설정에서 고르는 값 — 기기 언어를 따르거나, 두 언어 중 하나로 고정 */
export type LanguagePreference = 'system' | AppLanguage;

const FALLBACK_LOCALE = 'ko-KR';
const FALLBACK_TIMEZONE = 'Asia/Seoul';
const STORAGE_KEY = 'ear.displayLanguage';

const resolveDeviceIntl = (): { locale: string; timeZone: string } => {
  try {
    const options = Intl.DateTimeFormat().resolvedOptions();
    return {
      locale: options.locale || FALLBACK_LOCALE,
      timeZone: options.timeZone || FALLBACK_TIMEZONE,
    };
  } catch {
    return { locale: FALLBACK_LOCALE, timeZone: FALLBACK_TIMEZONE };
  }
};

const deviceIntl = resolveDeviceIntl();

/** 기기 로캘(BCP 47, 예 `en-US` · `ko-KR`) — 가입·기기 등록의 `language_code`. 고른 표시 언어와 무관하게 기기 값이다 */
export const DEVICE_LOCALE: string = deviceIntl.locale;

/** 기기 시간대(IANA, 예 `America/New_York`) — `X-Timezone` 헤더 값. 정책 판정에 쓰지 않는다 */
export const DEVICE_TIMEZONE: string = deviceIntl.timeZone;

/** 로캘 문자열 → 표시 언어. 한국어만 `ko`, 나머지는 `en` */
export const toAppLanguage = (locale: string): AppLanguage =>
  locale.toLowerCase().startsWith('ko') ? 'ko' : 'en';

const readPreference = (): LanguagePreference => {
  try {
    const value = SecureStore.getItem(STORAGE_KEY);
    if (value === 'system' || value === 'ko' || value === 'en') return value;
  } catch {
    // 저장소를 못 읽으면(웹·옛 빌드) 기기 언어를 따른다 — 표시 언어는 편의지 조건이 아니다
  }
  return 'system';
};

let preference: LanguagePreference = readPreference();

/** 이 실행 동안의 표시 언어 — 시작 때 정해지고, 바꾸면 JS 를 다시 부른다 */
export const APP_LANGUAGE: AppLanguage =
  preference === 'system' ? toAppLanguage(DEVICE_LOCALE) : preference;

/** 지금 표시 언어의 BCP 47 태그 — `Accept-Language`·설정 `language_code` 값. 기기 언어를 따르면 기기 로캘 그대로 */
export const DISPLAY_LOCALE: string =
  preference === 'system' ? DEVICE_LOCALE : APP_LANGUAGE === 'ko' ? 'ko-KR' : 'en-US';

/* ── 고른 언어 구독(설정 화면) ── */
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getPreference = () => preference;

export const useLanguagePreference = (): LanguagePreference =>
  useSyncExternalStore(subscribe, getPreference, getPreference);

/** 고른 값이 실제로 뜻하는 표시 언어 */
export const languageOf = (next: LanguagePreference): AppLanguage =>
  next === 'system' ? toAppLanguage(DEVICE_LOCALE) : next;

/** JS 다시 부르기 — 운영·개발 빌드는 expo-updates, 개발 서버는 DevSettings */
const reloadApp = () => {
  Updates.reloadAsync().catch(() => DevSettings.reload());
};

/**
 * 고른 언어를 저장한다. 표시 언어가 실제로 바뀌면 JS 를 다시 불러 모든 문구를 새 언어로 그린다
 * (사용자가 직접 바꾼 것이라 깜빡임은 감수한다). 서버 저장(`PATCH /users/me/settings { language_code }`)은 부르는 쪽 몫이다
 */
export function setLanguagePreference(next: LanguagePreference) {
  if (next === preference) return;
  preference = next;
  try {
    SecureStore.setItem(STORAGE_KEY, next);
  } catch {
    // 저장 실패 — 다시 부르면 이전 언어로 돌아간다. 그래도 지금 고른 언어를 적용해 본다
  }
  listeners.forEach((listener) => listener());
  if (languageOf(next) !== APP_LANGUAGE) reloadApp();
}
