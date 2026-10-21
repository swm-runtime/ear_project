import type { ColorScheme } from '@/shared/theme/color-mode';

/**
 * 표지와 어울리는 단색(시리즈 화면 바탕 — PM 2026-10-22 07:51, 애플 뮤직 앨범 화면). 표지의 blurhash(expo-image 가 기기에서 만든다 —
 * 네이티브 빌드 불필요)를 작은 격자로 풀어 **가장 또렷한 색 하나**를 고르고, 글자가 읽히게 모드별 밝기로 눌러 쓴다.
 *
 * - 평균색이 아니라 또렷한 색을 고른다 — 이어 표지는 흰 바탕에 파스텔 그림이라 평균은 거의 회색이다.
 * - 또렷한 색이 없으면(흑백 표지) 평균색의 색조를 쓰되 채도가 거의 없어 중성 회색에 가깝게 나온다.
 * - 다크는 깊은 색(밝기 16%), 라이트는 옅은 색(밝기 94%) — 본문 글자는 모드 기본색 그대로라 대비가 유지된다.
 * 순수 계산만 둔다 — 이미지에서 해시를 뽑는 일은 훅(`useArtworkTint`)이 한다.
 */

const BASE83 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

const decode83 = (text: string): number => {
  let value = 0;
  for (const char of text) {
    const digit = BASE83.indexOf(char);
    if (digit === -1) throw new Error('blurhash: invalid character');
    value = value * 83 + digit;
  }
  return value;
};

const srgbToLinear = (value: number): number => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (value: number): number => {
  const v = Math.max(0, Math.min(1, value));
  return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
};

const signPow = (value: number, exp: number): number => Math.sign(value) * Math.abs(value) ** exp;

export type Rgb = [number, number, number];

/** blurhash → width×height 픽셀(sRGB 0~255). 표준 디코더(woltapp/blurhash)를 줄인 것 — punch 1 */
export const decodeBlurhash = (hash: string, width: number, height: number): Rgb[] => {
  if (hash.length < 6) throw new Error('blurhash: too short');
  const sizeFlag = decode83(hash[0]);
  const numX = (sizeFlag % 9) + 1;
  const numY = Math.floor(sizeFlag / 9) + 1;
  if (hash.length !== 4 + 2 * numX * numY) throw new Error('blurhash: length mismatch');
  const maxAc = (decode83(hash[1]) + 1) / 166;

  const colors: [number, number, number][] = [];
  const dc = decode83(hash.slice(2, 6));
  colors.push([srgbToLinear(dc >> 16), srgbToLinear((dc >> 8) & 255), srgbToLinear(dc & 255)]);
  for (let i = 1; i < numX * numY; i += 1) {
    const ac = decode83(hash.slice(4 + i * 2, 6 + i * 2));
    const r = Math.floor(ac / (19 * 19));
    const g = Math.floor(ac / 19) % 19;
    const b = ac % 19;
    colors.push([
      signPow((r - 9) / 9, 2) * maxAc,
      signPow((g - 9) / 9, 2) * maxAc,
      signPow((b - 9) / 9, 2) * maxAc,
    ]);
  }

  const pixels: Rgb[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < numY; j += 1) {
        for (let i = 0; i < numX; i += 1) {
          const basis = Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height);
          const color = colors[i + j * numX];
          r += color[0] * basis;
          g += color[1] * basis;
          b += color[2] * basis;
        }
      }
      pixels.push([linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)]);
    }
  }
  return pixels;
};

type Hsl = [number, number, number];

const rgbToHsl = ([r, g, b]: Rgb): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / d + 2) / 6
        : ((rn - gn) / d + 4) / 6;
  return [h, s, l];
};

const hslToHex = ([h, s, l]: Hsl): string => {
  const hueToRgb = (p: number, q: number, t: number): number => {
    const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channels =
    s === 0 ? [l, l, l] : [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
  return `#${channels
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
};

/** 이보다 채도가 낮으면 "또렷한 색이 없다"로 본다(흑백·회색 표지) */
const VIVID_MIN_SATURATION = 0.12;
/** 모드별 바탕 밝기 — 다크는 깊게, 라이트는 옅게. 채도 상한은 바탕이 표지보다 튀지 않게 */
const TONE: Record<ColorScheme, { lightness: number; maxSaturation: number }> = {
  dark: { lightness: 0.16, maxSaturation: 0.45 },
  light: { lightness: 0.94, maxSaturation: 0.4 },
};
/** 격자 크기 — 6×6 이면 파스텔 그림 영역이 따로 잡힌다 */
const GRID = 6;

/** 격자에서 가장 또렷한 색 — 채도가 높고 너무 밝거나 어둡지 않은 칸. 없으면 null */
const pickVivid = (pixels: Rgb[]): Hsl | null => {
  let best: { hsl: Hsl; score: number } | null = null;
  for (const pixel of pixels) {
    const hsl = rgbToHsl(pixel);
    const [, s, l] = hsl;
    if (s < VIVID_MIN_SATURATION || l < 0.08 || l > 0.97) continue;
    const score = s * (1 - Math.abs(l - 0.55));
    if (best === null || score > best.score) best = { hsl, score };
  }
  return best?.hsl ?? null;
};

/** 표지 blurhash → 그 표지와 어울리는 바탕 단색(#RRGGBB). 해시가 깨졌으면 null — 화면은 기본 바탕을 쓴다 */
export const tintFromBlurhash = (hash: string, scheme: ColorScheme): string | null => {
  let pixels: Rgb[];
  try {
    pixels = decodeBlurhash(hash, GRID, GRID);
  } catch {
    return null;
  }
  const vivid = pickVivid(pixels);
  const average = rgbToHsl([
    pixels.reduce((sum, p) => sum + p[0], 0) / pixels.length,
    pixels.reduce((sum, p) => sum + p[1], 0) / pixels.length,
    pixels.reduce((sum, p) => sum + p[2], 0) / pixels.length,
  ]);
  const [h, s] = vivid ?? average;
  const tone = TONE[scheme];
  return hslToHex([h, Math.min(s, tone.maxSaturation), tone.lightness]);
};
