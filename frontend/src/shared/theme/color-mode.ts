import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { useSyncExternalStore } from 'react';
import {
  Appearance,
  AppState,
  DevSettings,
  Platform,
  useColorScheme,
  type ColorValue,
} from 'react-native';

import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from './palette';

/**
 * 화면 모드(다크 모드) — **설정에서 시스템 / 라이트 / 다크**(PM 2026-10-10).
 *
 * 색 값은 전부 JS 에 있다(./palette) — 나중에 색을 바꿔도 OTA 로 나간다. 모드에 따라 칠하는 방법만 플랫폼마다 다르다:
 * - **iOS**: `theme.color` 가 `DynamicColorIOS({ light, dark })` 라 OS 가 지금 모드의 값으로 칠한다. 고른 모드는
 *   `Appearance.setColorScheme` 으로 앱 창에 건다 — 바꾸면 즉시 다시 칠해지고 다시 그리기가 없다.
 * - **Android(·웹)**: JS 로 동적 색을 만들 수 없어 **앱이 켜질 때** 고른 모드의 팔레트 하나로 `theme.color` 를 정한다
 *   (`LAUNCH_SCHEME`). 모드가 바뀌면 JS 를 다시 불러 다시 칠한다 — 설정에서 직접 바꾸면 즉시, 시스템이 바뀐 것이면
 *   앱이 앞으로 돌아올 때(재생 중이면 미룬다 — 듣던 것이 끊기면 안 된다). `Appearance.setColorScheme` 은 Android 에서
 *   액티비티를 다시 만들 수 있어 부르지 않는다.
 *
 * 고른 모드는 `expo-secure-store` 에 둔다 — 시작 순간 **동기로** 읽어야 첫 화면부터 맞는 색이 된다(AsyncStorage 는 비동기).
 */
export type ColorModePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'ear.colorMode';

function readPreference(): ColorModePreference {
  try {
    const value = SecureStore.getItem(STORAGE_KEY);
    if (value === 'system' || value === 'light' || value === 'dark') return value;
  } catch {
    // 저장소를 못 읽으면 시스템을 따른다 — 모드는 편의지 조건이 아니다
  }
  return 'system';
}

const systemScheme = (): ColorScheme => (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

let preference: ColorModePreference = readPreference();

/** iOS: 고른 모드를 앱 창에 건다(시스템이면 풀어 둔다) */
const applyIosScheme = (pref: ColorModePreference) => {
  if (Platform.OS !== 'ios') return;
  try {
    Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
  } catch {
    // 옛 OS 등 — 시스템 모드로 남는다
  }
};
applyIosScheme(preference);

/** Android·웹: 이 실행 동안의 모드 — 시작 때 정하고 바뀌면 JS 를 다시 부른다 */
export const LAUNCH_SCHEME: ColorScheme = preference === 'system' ? systemScheme() : preference;

export const paletteOf = (scheme: ColorScheme): Palette =>
  scheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;

/** 지금 칠해진 모드 — iOS 는 창의 모드를 따라 바뀌고, Android 는 이 실행 동안 고정이다 */
export function useActiveScheme(): ColorScheme {
  const scheme = useColorScheme();
  if (Platform.OS === 'ios') return scheme === 'dark' ? 'dark' : 'light';
  return LAUNCH_SCHEME;
}

/**
 * 지금 모드의 **실제 색 문자열** — 문자열이 꼭 필요한 곳(애니메이션 색 보간·SVG·rgba 조합·네이티브 prop)에만 쓴다.
 * 그 밖에는 `theme.color` 를 쓴다(iOS 에서 모드가 바뀌면 다시 그리지 않고도 다시 칠해진다)
 */
export const useThemePalette = (): Palette => paletteOf(useActiveScheme());

/**
 * 토큰 값(`theme.color.*` — iOS 에선 DynamicColorIOS 객체)을 **지금 모드의 색 문자열**로 푼다. SVG 아이콘·애니메이션
 * 색 보간처럼 문자열만 받는 곳에서 쓴다
 */
export function resolveColor(value: ColorValue, scheme: ColorScheme): string {
  if (typeof value === 'string') return value;
  const dynamic = (value as { dynamic?: { light?: ColorValue; dark?: ColorValue } }).dynamic;
  if (dynamic) {
    const picked = scheme === 'dark' ? dynamic.dark : dynamic.light;
    return picked === undefined ? '' : resolveColor(picked, scheme);
  }
  return String(value);
}

/** 컴포넌트 안에서 쓰는 resolveColor — 모드가 바뀌면 다시 그려 새 값을 받는다 */
export const useResolvedColor = (value: ColorValue): string =>
  resolveColor(value, useActiveScheme());

/* ── 고른 모드 구독(설정 화면) ── */
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getPreference = () => preference;

export const useColorModePreference = (): ColorModePreference =>
  useSyncExternalStore(subscribe, getPreference, getPreference);

/** JS 다시 부르기 — 운영·개발 빌드는 expo-updates, 개발 서버는 DevSettings */
const reloadApp = () => {
  Updates.reloadAsync().catch(() => DevSettings.reload());
};

/**
 * 고른 모드를 저장하고 적용한다. iOS 는 즉시 다시 칠하고, Android 는 칠할 모드가 바뀌면 JS 를 다시 부른다
 * (사용자가 직접 바꾼 것이라 깜빡임은 감수한다)
 */
export function setColorModePreference(next: ColorModePreference) {
  if (next === preference) return;
  preference = next;
  try {
    SecureStore.setItem(STORAGE_KEY, next);
  } catch {
    // 저장 실패 — 이번 실행에만 적용된다
  }
  listeners.forEach((listener) => listener());
  if (Platform.OS === 'ios') {
    applyIosScheme(next);
    return;
  }
  const scheme = next === 'system' ? systemScheme() : next;
  if (scheme !== LAUNCH_SCHEME) reloadApp();
}

/* ── Android: 시스템 모드가 바뀐 것을 따라가기 ── */
let reloadGuard: () => boolean = () => false;

/**
 * 지금 JS 를 다시 부르면 안 되는가(재생 중 등) — 앱 조립(bootstrap)이 등록한다. shared 는 feature 를 모른다
 */
export function setColorModeReloadGuard(guard: () => boolean) {
  reloadGuard = guard;
}

let isSyncStarted = false;

/**
 * 시스템 모드를 따라가게 건다(앱 시작 때 한 번). **Android** 만 할 일이 있다 — 시스템 모드가 바뀌었고 "시스템"을 골랐으면,
 * 앱이 앞으로 돌아올 때 JS 를 다시 불러 다시 칠한다. 재생 중이면 미루고 다음에 돌아올 때 다시 본다
 */
export function startColorModeSync() {
  if (isSyncStarted || Platform.OS !== 'android') return;
  isSyncStarted = true;
  const needsRepaint = () => preference === 'system' && systemScheme() !== LAUNCH_SCHEME;
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && needsRepaint() && !reloadGuard()) reloadApp();
  });
}
