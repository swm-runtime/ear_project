import { describe, expect, it } from '@jest/globals';
import { Animated } from 'react-native';

import { createAndroidPlayerZoom } from './android-player-zoom';

const read = (node: unknown): number => (node as { __getValue(): number }).__getValue();

describe('Android 플레이어 네이티브 줌', () => {
  it.each([0, 0.25, 0.5, 0.75, 1])('진행도 %s에서 카드 경로와 콘텐츠 비율을 보존한다', (p) => {
    const zoom = createAndroidPlayerZoom(
      new Animated.Value(p),
      { x: 24, y: 700, width: 345, height: 46 },
      { width: 393, height: 852 },
    );
    const [tx, ty, sx, sy] = zoom.frame.transform;
    const scaleX = read(sx.scaleX);
    const scaleY = read(sy.scaleY);
    expect(read(tx.translateX)).toBeCloseTo(24 * (1 - p));
    expect(read(ty.translateY)).toBeCloseTo(700 * (1 - p));
    expect(zoom.frame.width * scaleX).toBeCloseTo(345 + (393 - 345) * p);
    expect(zoom.frame.height * scaleY).toBeCloseTo(46 + (852 - 46) * p);
    expect(scaleY * read(zoom.contentTransform[0].scaleY)).toBeCloseTo(scaleX);
    // 레이아웃 크기는 전환 내내 고정되어야 한다.
    expect(zoom.frame.width).toBe(393);
    expect(zoom.frame.height).toBe(852);
  });

  it('측정 전 크기가 0이어도 보정 배율이 유한하다', () => {
    const zoom = createAndroidPlayerZoom(
      new Animated.Value(0),
      { x: 0, y: 0, width: 0, height: 0 },
      { width: 0, height: 0 },
    );
    expect(Number.isFinite(read(zoom.contentTransform[0].scaleY))).toBe(true);
  });

  it.each([0, 0.5, 1])('닫기 %s에서 크기와 불투명도를 유지하며 화면 아래로 이동한다', (p) => {
    const zoom = createAndroidPlayerZoom(
      new Animated.Value(1),
      { x: 24, y: 700, width: 345, height: 46 },
      { width: 393, height: 852 },
      new Animated.Value(p),
    );
    const [tx, ty, sx, sy] = zoom.frame.transform;
    expect(read(tx.translateX)).toBe(0);
    expect(read(ty.translateY)).toBeCloseTo(852 * p);
    expect(read(sx.scaleX)).toBe(1);
    expect(read(sy.scaleY)).toBe(1);
    expect(zoom.frame.opacity).toBe(1);
  });
});
