import { InsightsSummary } from '../admin.types';
import {
  AdminInsightsSummaryResponseDto,
  ratio,
} from './admin-insights-summary-response.dto';

const listening = (
  over: Partial<InsightsSummary['listening']['allTime']> = {},
) => ({
  listenSec: 0,
  plays: 0,
  completes: 0,
  listeners: 0,
  saves: 0,
  ...over,
});

const summary = (): InsightsSummary => ({
  since: new Date('2026-09-24T00:00:00.000Z'),
  generatedAt: new Date('2026-10-08T00:00:00.000Z'),
  users: {
    totalSignups: 259,
    current: 225,
    withdrawals: 34,
    onboardingCompleted: 208,
    trialActive: 139,
    tiers: { light: 225, daily: 0, pro: 0 },
    tierEvents: { daily: 0, pro: 0 },
    paidActive: 0,
    activated: 149,
    active1d: 63,
    active7d: 190,
    active30d: 220,
    listeners1d: 52,
    listeners7d: 130,
    listeners30d: 149,
    byProvider: [{ provider: 'kakao', count: 200 }],
  },
  listening: {
    allTime: listening({
      listenSec: 122_642,
      plays: 373,
      completes: 54,
      listeners: 149,
      saves: 119,
    }),
    window: listening(),
  },
  daily: [],
  hourly: [],
  topUsers: [
    {
      userId: 'u1',
      listenSec: 3_600,
      plays: 4,
      completes: 2,
      tier: 'light',
      signedUpAt: new Date('2026-10-01T00:00:00.000Z'),
      lastPlayedAt: new Date('2026-10-07T00:00:00.000Z'),
    },
  ],
  topContents: [
    {
      contentId: 'c1',
      title: 'T',
      durationSec: 600,
      listenSec: 1_200,
      plays: 4,
      listeners: 3,
      completes: 1,
      saves: 2,
    },
  ],
  withdrawalReasons: [{ reasonCode: null, count: 3 }],
  retention: [
    { day: 1, cohortSize: 200, returned: 50 },
    { day: 30, cohortSize: 0, returned: 0 },
  ],
});

describe('AdminInsightsSummaryResponseDto', () => {
  it('ratio — 분모 0 은 null, 아니면 비율', () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });

  it('비율을 계산해 snake_case 로 내리고, 분모 0 인 비율은 null 로 둔다', () => {
    const dto = AdminInsightsSummaryResponseDto.from(summary(), 14);

    expect(dto.days).toBe(14);
    expect(dto.users.total_signups).toBe(259);
    expect(dto.users.withdrawal_rate).toBeCloseTo(34 / 259);
    expect(dto.users.activation_rate).toBeCloseTo(149 / 225);
    expect(dto.users.stickiness).toBeCloseTo(63 / 220);
    expect(dto.users.listener_rate_1d).toBeCloseTo(52 / 63);
    expect(dto.users.listener_rate_7d).toBeCloseTo(130 / 190);
    expect(dto.users.paid_rate).toBe(0);
    expect(dto.listening.all_time.complete_rate).toBeCloseTo(54 / 373);
    expect(dto.listening.all_time.avg_listen_sec_per_play).toBeCloseTo(
      122_642 / 373,
    );
    // 창 안 재생이 없으면 평균도 null — 0 으로 적으면 "아무도 안 들었다"와 "짧게 들었다"가 섞인다
    expect(dto.listening.window.complete_rate).toBeNull();
    expect(dto.listening.window.avg_listen_sec_per_play).toBeNull();
    expect(dto.top_users[0]).toEqual({
      user_id: 'u1',
      listen_sec: 3_600,
      plays: 4,
      completes: 2,
      tier: 'light',
      signed_up_at: '2026-10-01T00:00:00.000Z',
      last_played_at: '2026-10-07T00:00:00.000Z',
    });
    expect(dto.top_contents[0].complete_rate).toBe(0.25);
    expect(dto.retention[0].rate).toBe(0.25);
    expect(dto.retention[1].rate).toBeNull();
    expect(dto.withdrawal_reasons[0]).toEqual({ reason_code: null, count: 3 });
  });

  it('개인 식별 정보 필드가 어디에도 없다 — 사용자 순위는 user_id·티어·날짜뿐', () => {
    const dto = AdminInsightsSummaryResponseDto.from(summary(), 14);
    const keys = Object.keys(dto.top_users[0]);
    expect(keys).not.toEqual(expect.arrayContaining(['email', 'nickname']));
    expect(JSON.stringify(dto)).not.toMatch(/email|nickname/);
  });
});
