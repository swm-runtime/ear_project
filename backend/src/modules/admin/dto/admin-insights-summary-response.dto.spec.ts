import { UserMarket } from '@/modules/user/user.enum';

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
  market: null,
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
    paidEver: 9,
    activated: 149,
    active1d: 63,
    active7d: 190,
    active30d: 220,
    listeners1d: 52,
    listeners7d: 130,
    listeners30d: 149,
    byProvider: [{ provider: 'kakao', count: 200 }],
    byPlatform: [
      { platform: 'ios', count: 150 },
      { platform: 'android', count: 50 },
    ],
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
  daily: [
    {
      date: '2026-10-07',
      signups: 1,
      withdrawals: 0,
      plays: 3,
      listeners: 2,
      listenSec: 600,
      completes: 1,
      activeUsers: 5,
    },
    {
      date: '2026-09-01',
      signups: 0,
      withdrawals: 0,
      plays: 0,
      listeners: 0,
      listenSec: 0,
      completes: 0,
      activeUsers: null,
    },
  ],
  weekday: [
    {
      weekday: 1,
      label: '월',
      days: 2,
      activeDays: 1,
      avgActiveUsers: 5,
      avgListeners: 1.5,
    },
    {
      weekday: 2,
      label: '화',
      days: 0,
      activeDays: 0,
      avgActiveUsers: null,
      avgListeners: null,
    },
  ],
  activeUsersSince: '2026-09-19',
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
  recentTopContents: [
    {
      contentId: 'c2',
      title: 'R',
      durationSec: 300,
      listenSec: 900,
      plays: 3,
      listeners: 3,
      completes: 0,
      saves: 1,
    },
  ],
  recentSince: new Date('2026-10-07T00:00:00.000Z'),
  withdrawalReasons: [{ reasonCode: null, count: 3 }],
  retention: [
    { day: 1, cohortSize: 200, returned: 50 },
    { day: 30, cohortSize: 0, returned: 0 },
  ],
  pushReactions: [
    { type: 'drip_arrival', sent: 40, reacted: 10 },
    { type: 'retention.weekly_rank_gap.b', sent: 8, reacted: 2 },
  ],
  boundedRetention: [
    { day: 1, cohortSize: 180, returned: 27 },
    { day: 30, cohortSize: 0, returned: 0 },
  ],
  retentionCohorts: {
    daily: {
      span: 1,
      offsets: [1, 7],
      reliableSince: '2026-09-19',
      rows: [
        {
          start: '2026-10-07',
          users: 8,
          cells: [{ returned: 2, partial: false }, null],
        },
        {
          start: '2026-10-06',
          users: 0,
          cells: [{ returned: 0, partial: false }, null],
        },
      ],
    },
    weekly: {
      span: 7,
      offsets: [1, 2, 3, 4],
      reliableSince: '2026-09-19',
      rows: [
        {
          start: '2026-08-24',
          users: 10,
          cells: [
            { returned: 4, partial: true },
            { returned: 3, partial: false },
            { returned: 3, partial: false },
            { returned: 2, partial: false },
          ],
        },
      ],
    },
  },
  topicSupply: [
    {
      topicId: 'topic-1',
      name: '경제 상식',
      isVisible: true,
      published: 4,
      publishedInWindow: 1,
      interestedUsers: 177,
      medianRemaining: 1.5,
      exhaustedUsers: 20,
      lowUsers: 90,
    },
  ],
  byMarket: [
    {
      market: UserMarket.KR,
      users: 225,
      signupsInWindow: 30,
      onboardingCompleted: 208,
      active7d: 190,
      listeners7d: 130,
      listenSec: 70844,
      plays: 233,
      paidActive: 0,
    },
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
    // 유료 경험(해지·만료 포함)은 지금 유료와 따로 센다 — 분모는 같은 현재 가입자
    expect(dto.users.paid_ever).toBe(9);
    expect(dto.users.paid_ever_rate).toBe(0.04);
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
    expect(dto.recent_top_contents[0]).toEqual({
      content_id: 'c2',
      title: 'R',
      duration_sec: 300,
      listen_sec: 900,
      plays: 3,
      listeners: 3,
      completes: 0,
      complete_rate: 0,
      saves: 1,
    });
    expect(dto.recent_since).toBe('2026-10-07T00:00:00.000Z');
    expect(dto.retention[0].rate).toBe(0.25);
    expect(dto.retention[1].rate).toBeNull();
    // 바운디드는 같은 줄에 따로 싣는다 — 분모가 다르다(N일째가 다 지났고 기록을 믿을 수 있는 가입자)
    expect(dto.retention[0]).toMatchObject({
      bounded_cohort_size: 180,
      bounded_returned: 27,
      bounded_rate: 0.15,
    });
    expect(dto.retention[1].bounded_rate).toBeNull();
    expect(dto.withdrawal_reasons[0]).toEqual({ reason_code: null, count: 3 });
    // 리텐션 알림은 종류에서 규칙·변형을 풀어 싣는다 — 드립 도착은 기준선이라 둘 다 null
    expect(dto.push_reactions).toEqual([
      {
        type: 'drip_arrival',
        rule: null,
        variant: null,
        sent: 40,
        reacted: 10,
        reaction_rate: 0.25,
      },
      {
        type: 'retention.weekly_rank_gap.b',
        rule: 'weekly_rank_gap',
        variant: 'b',
        sent: 8,
        reacted: 2,
        reaction_rate: 0.25,
      },
    ]);
    expect(dto.topic_supply[0]).toEqual({
      topic_id: 'topic-1',
      name: '경제 상식',
      is_visible: true,
      published: 4,
      published_in_window: 1,
      interested_users: 177,
      median_remaining: 1.5,
      exhausted_users: 20,
      low_users: 90,
    });
  });

  it('코호트 칸마다 비율을 붙이고, 끝나지 않은 칸(null)과 가입 0명 묶음의 비율(null)을 그대로 둔다', () => {
    // when
    const dto = AdminInsightsSummaryResponseDto.from(summary(), 14);

    // then
    const daily = dto.retention_cohorts.daily;
    expect(daily.span).toBe(1);
    expect(daily.offsets).toEqual([1, 7]);
    expect(daily.reliable_since).toBe('2026-09-19');
    expect(daily.rows[0]).toEqual({
      start: '2026-10-07',
      users: 8,
      cells: [{ returned: 2, rate: 0.25, partial: false }, null],
    });
    expect(daily.rows[1].cells[0]).toEqual({
      returned: 0,
      rate: null,
      partial: false,
    });
    expect(dto.retention_cohorts.weekly.rows[0].cells[0]).toEqual({
      returned: 4,
      rate: 0.4,
      partial: true,
    });
  });

  it('시장별 집계를 snake_case 로 시장마다 한 칸씩 내린다', () => {
    // when
    const dto = AdminInsightsSummaryResponseDto.from(summary(), 14);

    // then
    expect(dto.by_market).toEqual([
      {
        market: 'kr',
        users: 225,
        signups_in_window: 30,
        onboarding_completed: 208,
        active_7d: 190,
        listeners_7d: 130,
        listen_sec: 70844,
        plays: 233,
        paid_active: 0,
      },
    ]);
  });

  it('일별 접속자·요일별 평균·첫 신뢰 날짜를 snake_case 로 내리고, 모르는 값은 null 그대로 둔다', () => {
    // when
    const dto = AdminInsightsSummaryResponseDto.from(summary(), 14);

    // then
    expect(dto.daily.map((d) => d.active_users)).toEqual([5, null]);
    expect(dto.weekday).toEqual([
      {
        weekday: 1,
        label: '월',
        days: 2,
        active_days: 1,
        avg_active_users: 5,
        avg_listeners: 1.5,
      },
      {
        weekday: 2,
        label: '화',
        days: 0,
        active_days: 0,
        avg_active_users: null,
        avg_listeners: null,
      },
    ]);
    expect(dto.active_users_since).toBe('2026-09-19');
  });

  it('개인 식별 정보 필드가 어디에도 없다 — 사용자 순위는 user_id·티어·날짜뿐', () => {
    const dto = AdminInsightsSummaryResponseDto.from(summary(), 14);
    const keys = Object.keys(dto.top_users[0]);
    expect(keys).not.toEqual(expect.arrayContaining(['email', 'nickname']));
    expect(JSON.stringify(dto)).not.toMatch(/email|nickname/);
  });
});
