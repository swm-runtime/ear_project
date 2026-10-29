import { AdminInsightsDripArrivalTimeResponseDto } from './admin-insights-drip-arrival-time-response.dto';

describe('AdminInsightsDripArrivalTimeResponseDto', () => {
  it('snake_case 로 옮기고, 사용자 식별 칸·클릭률 없이 집계만 싣는다', () => {
    // when
    const dto = AdminInsightsDripArrivalTimeResponseDto.from(
      {
        generatedAt: new Date('2026-10-30T00:00:00.000Z'),
        market: null,
        days: 14,
        since: new Date('2026-10-16T00:00:00.000Z'),
        arms: [
          {
            key: 'baseline',
            sendTime: '07:00',
            reference: false,
            sent: 10,
            users: 9,
            played2h: 1,
            playedSameDay: 2,
            playRate2h: 0.1,
            playRateSameDay: 0.2,
            firstSentAt: new Date('2026-10-16T22:00:00.000Z'),
            lastSentAt: new Date('2026-10-29T22:00:00.000Z'),
          },
          {
            key: 'morning',
            sendTime: '08:00',
            reference: true,
            sent: 0,
            users: 0,
            played2h: 0,
            playedSameDay: 0,
            playRate2h: null,
            playRateSameDay: null,
            firstSentAt: null,
            lastSentAt: null,
          },
        ],
      },
      { minSample: 100, reactionWindowHours: 2 },
    );

    // then
    expect(dto).toMatchObject({
      generated_at: '2026-10-30T00:00:00.000Z',
      market: null,
      days: 14,
      since: '2026-10-16T00:00:00.000Z',
      min_sample: 100,
      reaction_window_hours: 2,
    });
    expect(dto.arms[0]).toEqual({
      key: 'baseline',
      send_time: '07:00',
      reference: false,
      sent: 10,
      users: 9,
      played_2h: 1,
      played_same_day: 2,
      play_rate_2h: 0.1,
      play_rate_same_day: 0.2,
      first_sent_at: '2026-10-16T22:00:00.000Z',
      last_sent_at: '2026-10-29T22:00:00.000Z',
    });
    expect(dto.arms[1]).toMatchObject({
      reference: true,
      play_rate_2h: null,
      first_sent_at: null,
    });
    expect(JSON.stringify(dto)).not.toMatch(/user_id|email|nickname|open/);
  });
});
