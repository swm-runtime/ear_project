/**
 * 버블 배치 테스트 — 붙어 있되 겹치지 않고, 커진 버블이 이웃을 밀어내며, 화면 밖으로 나가지 않는다(PM 2026-10-09 23:02).
 */
import { describe, expect, it } from '@jest/globals';

import { BUBBLE_GAP, bubbleSize, layoutBubbles } from './bubble-layout';

const WIDTH = 390;

const inputs = (count: number, selected: number[] = [], full = false) =>
  Array.from({ length: count }, (_, index) => ({
    size: bubbleSize(index, WIDTH),
    scale: selected.includes(index) ? 1.16 : full ? 0.9 : 1,
  }));

const minClearance = (bubbles: ReturnType<typeof inputs>) => {
  const { places } = layoutBubbles(bubbles, WIDTH);
  let min = Infinity;
  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      const distance = Math.hypot(places[j].cx - places[i].cx, places[j].cy - places[i].cy);
      const ri = (bubbles[i].size * bubbles[i].scale) / 2;
      const rj = (bubbles[j].size * bubbles[j].scale) / 2;
      min = Math.min(min, distance - ri - rj);
    }
  }
  return min;
};

describe('관심 주제 버블 배치', () => {
  it('아무것도 고르지 않아도 원끼리 겹치지 않는다', () => {
    expect(minClearance(inputs(16))).toBeGreaterThan(-1);
  });

  it('세 개를 골라 커져도 이웃이 밀려나 겹치지 않는다', () => {
    expect(minClearance(inputs(16, [1, 7, 12], true))).toBeGreaterThan(-1);
  });

  it('원은 붙어 있다 — 이웃과의 빈틈이 정해진 간격에서 크게 벌어지지 않는다', () => {
    const bubbles = inputs(16);
    const { places } = layoutBubbles(bubbles, WIDTH);
    // 각 원의 가장 가까운 이웃까지 빈틈 — 벌집이라 GAP 근처여야 한다
    places.forEach((place, i) => {
      let nearest = Infinity;
      places.forEach((other, j) => {
        if (i === j) return;
        const ri = (bubbles[i].size * bubbles[i].scale) / 2;
        const rj = (bubbles[j].size * bubbles[j].scale) / 2;
        nearest = Math.min(nearest, Math.hypot(other.cx - place.cx, other.cy - place.cy) - ri - rj);
      });
      expect(nearest).toBeLessThan(BUBBLE_GAP + 12);
    });
  });

  it('같은 입력이면 같은 자리다', () => {
    expect(layoutBubbles(inputs(16, [2]), WIDTH)).toEqual(layoutBubbles(inputs(16, [2]), WIDTH));
  });

  it('화면 밖으로 나가지 않는다', () => {
    const bubbles = inputs(16, [0, 2, 3]);
    const { places } = layoutBubbles(bubbles, WIDTH);
    places.forEach((place, i) => {
      const r = (bubbles[i].size * bubbles[i].scale) / 2;
      expect(place.cx - r).toBeGreaterThanOrEqual(0);
      expect(place.cx + r).toBeLessThanOrEqual(WIDTH);
    });
  });
});
