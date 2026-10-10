/**
 * 버블 물리 테스트 — 중앙으로 뭉치고, 겹치지 않고, 밭 밖으로 나가지 않으며, 커진 버블이 이웃을 밀어낸다.
 */
import { describe, expect, it } from '@jest/globals';

import {
  BUBBLE_GAP,
  bubbleBaseSize,
  bubbleSizeAt,
  createBubbleSim,
  settleBubbleSim,
  type BubbleSim,
} from './bubble-physics';

const W = 390;
const H = 600;
const N = 16;

const make = (selected: number[] = []) => {
  const base = bubbleBaseSize(N, W, H);
  const sim = createBubbleSim(
    Array.from({ length: N }, (_, i) => bubbleSizeAt(i, base)),
    W,
    H,
  );
  selected.forEach((i) => {
    sim.target[i] = 1.2;
  });
  settleBubbleSim(sim, W, H);
  return sim;
};

const radius = (sim: BubbleSim, i: number) => (sim.size[i] * sim.scale[i]) / 2;
const clearance = (sim: BubbleSim, i: number, j: number) =>
  Math.hypot(sim.x[j] - sim.x[i], sim.y[j] - sim.y[i]) - radius(sim, i) - radius(sim, j);

describe('관심 주제 버블 물리', () => {
  it('바깥에서 출발해도 전부 밭 안으로 들어와 멈춘다', () => {
    const sim = make();
    sim.x.forEach((x, i) => {
      expect(x - radius(sim, i)).toBeGreaterThanOrEqual(-0.5);
      expect(x + radius(sim, i)).toBeLessThanOrEqual(W + 0.5);
      expect(sim.y[i] - radius(sim, i)).toBeGreaterThanOrEqual(-0.5);
      expect(sim.y[i] + radius(sim, i)).toBeLessThanOrEqual(H + 0.5);
    });
    expect(sim.calmFor).toBeGreaterThan(0);
  });

  it('원끼리 겹치지 않는다(빈틈을 크게 깎아 먹지 않는다)', () => {
    const sim = make([1, 7, 12]);
    for (let i = 0; i < N; i += 1) {
      for (let j = i + 1; j < N; j += 1) {
        expect(clearance(sim, i, j)).toBeGreaterThan(BUBBLE_GAP - 3);
      }
    }
  });

  it('한 덩어리로 뭉친다 — 모든 원이 이웃과 붙어 있다', () => {
    const sim = make();
    for (let i = 0; i < N; i += 1) {
      let nearest = Infinity;
      for (let j = 0; j < N; j += 1) if (i !== j) nearest = Math.min(nearest, clearance(sim, i, j));
      expect(nearest).toBeLessThan(BUBBLE_GAP + 4);
    }
  });

  it('고른 원이 커지면 이웃이 밀려난다', () => {
    const before = make();
    const after = make([5]);
    const nearestCenter = (sim: BubbleSim) => {
      let best = Infinity;
      for (let j = 0; j < N; j += 1) {
        if (j !== 5) best = Math.min(best, Math.hypot(sim.x[j] - sim.x[5], sim.y[j] - sim.y[5]));
      }
      return best;
    };
    expect(nearestCenter(after)).toBeGreaterThan(nearestCenter(before));
  });

  it('주제가 많으면 원이 작아진다', () => {
    expect(bubbleBaseSize(32, W, H)).toBeLessThan(bubbleBaseSize(16, W, H));
  });
});
