import { describe, expect, it } from '@jest/globals';

import { decodeBlurhash, tintFromBlurhash } from './explore.artwork-tint';

const BASE83 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
const encode83 = (value: number, length: number): string => {
  let out = '';
  for (let i = 1; i <= length; i += 1) {
    out += BASE83[Math.floor(value / 83 ** (length - i)) % 83];
  }
  return out;
};
/** 단색 blurhash — 성분 1×1(DC 만) */
const solid = (rgb: number): string => `00${encode83(rgb, 4)}`;

const hexToHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6;
  return [h, s, l];
};

describe('표지와 어울리는 바탕 단색(시리즈 화면)', () => {
  it('단색 해시는 그 색 그대로 풀린다', () => {
    const pixels = decodeBlurhash(solid(0x3080c0), 2, 2);
    expect(pixels).toHaveLength(4);
    pixels.forEach((pixel) => {
      expect(pixel[0]).toBeCloseTo(0x30, -1);
      expect(pixel[1]).toBeCloseTo(0x80, -1);
      expect(pixel[2]).toBeCloseTo(0xc0, -1);
    });
  });

  it('공식 예제 해시도 깨지지 않고 격자를 낸다', () => {
    expect(decodeBlurhash('LEHV6nWB2yk8pyo0adR*.7kCMdnj', 6, 6)).toHaveLength(36);
  });

  it('다크는 표지 색조를 지킨 채 깊게(밝기 16%), 라이트는 옅게(94%) 누른다', () => {
    const [hue] = hexToHsl('#3080C0');
    const dark = tintFromBlurhash(solid(0x3080c0), 'dark');
    const light = tintFromBlurhash(solid(0x3080c0), 'light');
    expect(dark).toMatch(/^#[0-9A-F]{6}$/);
    const [dh, ds, dl] = hexToHsl(dark ?? '');
    expect(dl).toBeCloseTo(0.16, 1);
    expect(dh).toBeCloseTo(hue, 1);
    expect(ds).toBeLessThanOrEqual(0.46);
    expect(hexToHsl(light ?? '')[2]).toBeCloseTo(0.94, 1);
  });

  it('흑백 표지는 채도 없는 중성색이 된다', () => {
    const [, s] = hexToHsl(tintFromBlurhash(solid(0xf2f2f2), 'dark') ?? '');
    expect(s).toBeLessThan(0.05);
  });

  it('깨진 해시는 null — 화면은 기본 바탕을 쓴다', () => {
    expect(tintFromBlurhash('xx', 'dark')).toBeNull();
    expect(tintFromBlurhash('!!!!!!', 'dark')).toBeNull();
  });
});
