import { ttlUntilNextDripBatchSec } from './push-ttl.util';

describe('ttlUntilNextDripBatchSec — 다음 05:00 KST 배치까지', () => {
  it('05:00 KST 정각 배치의 알림은 다음 날 05:00 KST까지 산다(≈24시간)', () => {
    // 2026-09-27 05:00:00 KST = 2026-09-26T20:00:00Z
    expect(ttlUntilNextDripBatchSec(new Date('2026-09-26T20:00:00Z'))).toBe(
      24 * 60 * 60,
    );
  });

  it('배치가 늦게 돌면 그만큼 짧아진다 — 07:30 KST 재실행이면 21.5시간', () => {
    expect(ttlUntilNextDripBatchSec(new Date('2026-09-26T22:30:00Z'))).toBe(
      21.5 * 60 * 60,
    );
  });

  it('04:30 KST(같은 서비스 날짜, 배치 직전)면 30분이 아니라 하한 1시간이다', () => {
    expect(ttlUntilNextDripBatchSec(new Date('2026-09-26T19:30:00Z'))).toBe(
      60 * 60,
    );
  });
});
