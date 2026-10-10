/**
 * 버블 물리 테스트 — 자기 자리로 모이고, 순서가 바뀌지 않고, 겹치지 않고, 커진 버블이 이웃을 밀어내며, 크기가 섞인다.
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

const make = (selected: number[] = [], full = false) => {
  const base = bubbleBaseSize(N, W, H);
  const sim = createBubbleSim(
    Array.from({ length: N }, (_, i) => bubbleSizeAt(i, base)),
    W,
    H,
  );
  for (let i = 0; i < N; i += 1) {
    sim.target[i] = selected.includes(i) ? 1.2 : full ? 0.88 : 1;
  }
  settleBubbleSim(sim);
  return sim;
};

const radius = (sim: BubbleSim, i: number) => (sim.size[i] * sim.scale[i]) / 2;
const clearance = (sim: BubbleSim, i: number, j: number) =>
  Math.hypot(sim.x[j] - sim.x[i], sim.y[j] - sim.y[i]) - radius(sim, i) - radius(sim, j);

describe('관심 주제 버블 물리', () => {
  it('바깥에서 출발해 밭 안의 자기 자리로 모여 멈춘다', () => {
    const sim = make();
    for (let i = 0; i < N; i += 1) {
      expect(sim.x[i] - radius(sim, i)).toBeGreaterThanOrEqual(-1);
      expect(sim.x[i] + radius(sim, i)).toBeLessThanOrEqual(W + 1);
      expect(sim.y[i] - radius(sim, i)).toBeGreaterThanOrEqual(-1);
      expect(sim.y[i] + radius(sim, i)).toBeLessThanOrEqual(H + 1);
      expect(Math.hypot(sim.x[i] - sim.hx[i], sim.y[i] - sim.hy[i])).toBeLessThan(4);
    }
    expect(sim.calmFor).toBeGreaterThan(0);
  });

  it('세 개를 골라도 순서가 바뀌지 않는다 — 모든 원이 자기 자리에 가장 가깝다', () => {
    const sim = make([1, 7, 12], true);
    for (let i = 0; i < N; i += 1) {
      const own = Math.hypot(sim.x[i] - sim.hx[i], sim.y[i] - sim.hy[i]);
      for (let j = 0; j < N; j += 1) {
        if (j !== i)
          expect(own).toBeLessThan(Math.hypot(sim.x[i] - sim.hx[j], sim.y[i] - sim.hy[j]));
      }
    }
  });

  it('원끼리 겹치지 않는다', () => {
    const sim = make([1, 7, 12], true);
    for (let i = 0; i < N; i += 1) {
      for (let j = i + 1; j < N; j += 1) {
        expect(clearance(sim, i, j)).toBeGreaterThan(BUBBLE_GAP - 3);
      }
    }
  });

  it('고른 원이 커지면 이웃이 밀려난다', () => {
    const nearestCenter = (sim: BubbleSim, k: number) => {
      let best = Infinity;
      for (let j = 0; j < N; j += 1) {
        if (j !== k) best = Math.min(best, Math.hypot(sim.x[j] - sim.x[k], sim.y[j] - sim.y[k]));
      }
      return best;
    };
    expect(nearestCenter(make([5]), 5)).toBeGreaterThan(nearestCenter(make(), 5));
  });

  it('크기가 섞인다 — 가장 큰 원이 가장 작은 원의 1.4배 이상', () => {
    const base = bubbleBaseSize(N, W, H);
    const sizes = Array.from({ length: N }, (_, i) => bubbleSizeAt(i, base));
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThanOrEqual(1.4);
  });

  it('주제가 많으면 원이 작아진다', () => {
    expect(bubbleBaseSize(32, W, H)).toBeLessThan(bubbleBaseSize(16, W, H));
  });
});
