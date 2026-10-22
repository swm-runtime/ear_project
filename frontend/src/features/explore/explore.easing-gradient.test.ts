import { describe, expect, it } from '@jest/globals';

import { easedAlphaGradient, smoothstep } from './explore.easing-gradient';

describe('곡선 그라데이션', () => {
  it('smoothstep 은 양 끝이 0·1 이고 가운데가 0.5, 범위 밖은 자른다', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
  });

  it('점은 steps+1 개, 처음·끝 불투명도가 from·to 이고 위치는 0→1', () => {
    const gradient = easedAlphaGradient('0, 0, 0', 1, 0, 16);
    expect(gradient.colors).toHaveLength(17);
    expect(gradient.colors[0]).toBe('rgba(0, 0, 0, 1)');
    expect(gradient.colors[16]).toBe('rgba(0, 0, 0, 0)');
    expect(gradient.locations[0]).toBe(0);
    expect(gradient.locations[16]).toBe(1);
  });

  it('양 끝 근처는 천천히 변한다(직선보다 덜 움직인다)', () => {
    const gradient = easedAlphaGradient('0, 0, 0', 0, 1, 16);
    // 첫 칸(1/16) — 직선이면 0.0625, 곡선은 그보다 작다
    expect(gradient.colors[1]).toBe('rgba(0, 0, 0, 0.011)');
  });
});
