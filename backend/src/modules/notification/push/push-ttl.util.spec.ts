import { ttlUntilNextDripBatchSec } from './push-ttl.util';

describe('ttlUntilNextDripBatchSec — 그룹의 다음 배치까지', () => {
  const NEXT_BATCH_AT = new Date('2026-09-27T20:00:00Z'); // 2026-09-28 05:00 KST

  it('다음 배치까지 남은 초다 — 07:00 KST 발송이면 22시간', () => {
    // when / then — 2026-09-27 07:00 KST
    expect(
      ttlUntilNextDripBatchSec(NEXT_BATCH_AT, new Date('2026-09-26T22:00:00Z')),
    ).toBe(22 * 60 * 60);
  });

  it('다음 배치가 1시간 안이면 하한 1시간이다 — 배치 소요 중에 만료되지 않게', () => {
    // when / then — 다음 배치 30분 전
    expect(
      ttlUntilNextDripBatchSec(NEXT_BATCH_AT, new Date('2026-09-27T19:30:00Z')),
    ).toBe(60 * 60);
  });
});
