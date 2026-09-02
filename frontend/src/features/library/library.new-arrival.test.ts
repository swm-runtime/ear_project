import { describe, expect, it } from '@jest/globals';

import { evaluateDripArrivals } from './library.new-arrival';
import type { LibraryItem } from './library.types';

type ArrivalInput = Pick<LibraryItem, 'source' | 'addedAt'>;

const item = (source: ArrivalInput['source'], addedAt: string): ArrivalInput => ({
  source,
  addedAt,
});

describe('evaluateDripArrivals — "새 콘텐츠 N개 도착" 판정(library-api.md 4.1)', () => {
  it('첫 관측은 배너 없이 기준값만 기록한다', () => {
    const result = evaluateDripArrivals(
      [item('drip', '2026-08-27T04:00:00Z'), item('drip', '2026-08-26T04:00:00Z')],
      null,
    );
    expect(result.newCount).toBe(0);
    expect(result.baseline).toBe('2026-08-27T04:00:00Z');
  });

  it('기준값보다 늦게 도착한 드립을 센다', () => {
    const result = evaluateDripArrivals(
      [item('drip', '2026-08-27T04:00:00Z'), item('drip', '2026-08-26T04:00:00Z')],
      '2026-08-26T04:00:00Z',
    );
    expect(result.newCount).toBe(1);
    expect(result.baseline).toBe('2026-08-27T04:00:00Z');
  });

  it('탐험 편(discovery)도 배너 카운트·기준값에 포함한다(개정 2026-08-27)', () => {
    const result = evaluateDripArrivals(
      [item('drip', '2026-08-27T04:00:00Z'), item('discovery', '2026-08-27T04:05:00Z')],
      '2026-08-26T04:00:00Z',
    );
    expect(result.newCount).toBe(2);
    expect(result.baseline).toBe('2026-08-27T04:05:00Z');
  });

  it('담기·온보딩 적립은 세지 않는다 — 사용자가 스스로 한 조작이다', () => {
    const result = evaluateDripArrivals(
      [item('save', '2026-08-27T05:00:00Z'), item('onboarding', '2026-08-27T05:00:00Z')],
      '2026-08-26T04:00:00Z',
    );
    expect(result.newCount).toBe(0);
    expect(result.baseline).toBe('2026-08-26T04:00:00Z');
  });

  it('편성분이 0건인 조회는 기준값을 건드리지 않는다 — 필터를 푼 뒤 도착을 놓치지 않게', () => {
    const result = evaluateDripArrivals([item('save', '2026-08-27T05:00:00Z')], null);
    expect(result.baseline).toBeNull();
    expect(result.newCount).toBe(0);
  });

  it('옛 편성분만 보이는 조회가 기준값을 되돌리지 않는다 — 단조 증가', () => {
    const result = evaluateDripArrivals(
      [item('discovery', '2026-08-20T04:00:00Z')],
      '2026-08-26T04:00:00Z',
    );
    expect(result.baseline).toBe('2026-08-26T04:00:00Z');
    expect(result.newCount).toBe(0);
  });
});
