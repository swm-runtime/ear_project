import { normalizeRealtimeRows } from './ga4-realtime.client';

describe('normalizeRealtimeRows — GA4 실시간 응답 행 → 분 단위 묶음', () => {
  it('minutesAgo·platform·eventCount 를 읽고, 숫자가 아닌 묶음 행과 0건은 버린다', () => {
    const rows = normalizeRealtimeRows({
      rows: [
        {
          dimensionValues: [{ value: '12' }, { value: 'Android' }],
          metricValues: [{ value: '2' }],
        },
        {
          dimensionValues: [{ value: '(other)' }, { value: 'Android' }],
          metricValues: [{ value: '5' }],
        },
        {
          dimensionValues: [{ value: '3' }, { value: '' }],
          metricValues: [{ value: '0' }],
        },
        {
          dimensionValues: [{ value: '4' }, { value: '' }],
          metricValues: [{ value: '1' }],
        },
      ],
    });

    expect(rows).toEqual([
      { minutesAgo: 12, platform: 'Android', count: 2 },
      { minutesAgo: 4, platform: 'unknown', count: 1 },
    ]);
  });

  it('행이 없으면 빈 배열', () => {
    expect(normalizeRealtimeRows({})).toEqual([]);
  });
});
