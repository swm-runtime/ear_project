/**
 * 디자인 토큰. 값은 디자인 확정 전 임시값이다 — wireframe/style.css 토큰은 근거로 삼지
 * 않는다(CLAUDE.md). 컴포넌트는 이 토큰만 참조한다.
 *
 * **색은 화면 모드(라이트·다크)를 따른다**(PM 2026-10-10). 실제 값은 `./palette`, 칠하는 방법은 `./color-mode` —
 * iOS 는 `DynamicColorIOS` 라 모드가 바뀌면 OS 가 다시 칠하고, Android·웹은 앱이 켜질 때 고른 팔레트 값이다.
 * 그래서 `theme.color.*` 는 **문자열이 아닐 수 있다**(iOS) — 색 문자열이 꼭 필요하면 `useThemePalette()` 를 쓴다.
 */
import { Dimensions, DynamicColorIOS, Platform, type ColorValue } from 'react-native';

import { LAUNCH_SCHEME } from './color-mode';
import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from './palette';

/** iOS 26 시스템 탭 바의 좌우 여백(실측) — Android 독 폭이 이 값을 따른다(theme.dock.width) */
const DOCK_SIDE_MARGIN = 21;

/** 한 토큰 — iOS 는 모드를 따라 OS 가 칠하고, Android·웹은 시작 때 고른 모드의 값 */
const adaptive = (light: string, dark: string): ColorValue =>
  Platform.OS === 'ios'
    ? DynamicColorIOS({ light, dark })
    : LAUNCH_SCHEME === 'dark'
      ? dark
      : light;

type ThemeColors = { [K in Exclude<keyof Palette, 'chart'>]: ColorValue } & {
  chart: readonly ColorValue[];
};

const buildColors = (): ThemeColors => {
  const colors = {} as Record<string, ColorValue>;
  (Object.keys(LIGHT_PALETTE) as (keyof Palette)[]).forEach((key) => {
    if (key === 'chart') return;
    colors[key] = adaptive(LIGHT_PALETTE[key] as string, DARK_PALETTE[key] as string);
  });
  return {
    ...(colors as Omit<ThemeColors, 'chart'>),
    chart: LIGHT_PALETTE.chart.map((light, index) =>
      adaptive(light, DARK_PALETTE.chart[index] ?? light),
    ),
  };
};

export const theme = {
  color: buildColors(),
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    /** 다이얼로그·바텀시트의 모서리. 면이 큰 표면일수록 곡률을 키워야 같은 부드러움으로 읽힌다 */
    xl: 24,
    /** 알약(양 끝이 반원). 높이가 바뀌어도 항상 반원이 되도록 충분히 큰 값을 둔다 */
    full: 999,
  },
  font: {
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 28,
      /** iOS 큰 제목(Large Title) — 콘텐츠 안 제목 줄(LargeTitleRow) */
      xxl: 34,
    },
  },
  /** auth-uiux.md 7 — 터치 타깃 최소 44pt */
  /** 하단 독 — 캡슐 탭 바와 미니플레이어 카드가 같은 폭으로 가운데 선다(2026-09-23 PM). 칸 96 × 3 */
  dock: {
    /*
     * 떠 있는 하단 독(캡슐 탭 바 · 미니플레이어 카드)의 폭. iOS 26 은 시스템 탭 바라 이 값을 안 쓰고, 그 탭 바는 화면 폭에서
     * 양옆 21pt 씩 뺀 폭이다(PM 2026-09-29 스샷 실측 — 393pt 화면에서 351). **Android 도 같은 규칙**으로 맞춘다
     * (PM 2026-09-29 15:19 "안드로이드 하단 footer·미니플레이어 너비가 iOS 랑 다르다" — 종전 288 고정). 세로 고정 앱이라
     * 시작 때 한 번 재도 된다. iOS 26 미만(캡슐)은 종전 288 그대로
     */
    width: Platform.OS === 'android' ? Dimensions.get('window').width - DOCK_SIDE_MARGIN * 2 : 288,
  },
  touchTarget: {
    minHeight: 44,
    minWidth: 44,
  },
} as const;

export type Theme = typeof theme;

export { motion } from './motion';
export {
  LAUNCH_SCHEME,
  paletteOf,
  setColorModePreference,
  setColorModeReloadGuard,
  startColorModeSync,
  useActiveScheme,
  useColorModePreference,
  useResolvedColor,
  resolveColor,
  useThemePalette,
  type ColorModePreference,
  type ColorScheme,
} from './color-mode';
export type { Palette } from './palette';
