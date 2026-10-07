import {
  describeServiceDayBoundary,
  summarizeFeatures,
} from './startup-summary';

describe('summarizeFeatures', () => {
  const all = {
    environment: 'production',
    scheduler: true,
    sentry: true,
    resourceAlert: true,
    signupAlert: true,
    dailyMetrics: true,
    vocReview: true,
    appRemoveAlert: true,
    sentryRelay: true,
    crons: ['push-receipt', 'daily-metrics', 'content-stat-aggregation'],
    serviceDayBoundary: '04:00',
  };

  it('한 줄에 전부 담고 크론 이름은 정렬한다 — 배포마다 비교하기 쉽게', () => {
    expect(summarizeFeatures(all)).toBe(
      'features env=production scheduler=yes sentry=on resource-alert=on signup-alert=on daily-metrics=on voc-review=on app-remove-alert=on sentry-relay=on service-day=04:00 crons=[content-stat-aggregation,daily-metrics,push-receipt]',
    );
  });

  it('꺼진 것은 off, 스케줄러가 아니면 크론이 비어 있다', () => {
    const text = summarizeFeatures({
      ...all,
      scheduler: false,
      sentry: false,
      dailyMetrics: false,
      crons: [],
    });
    expect(text).toContain('scheduler=no');
    expect(text).toContain('sentry=off');
    expect(text).toContain('daily-metrics=off');
    expect(text).toContain('crons=[]');
  });

  it('환경이 비면 - 로 적는다', () => {
    expect(summarizeFeatures({ ...all, environment: '' })).toContain('env=-');
  });

  it('값을 찍지 않는다 — 있는지 없는지만(경계 전환 시각은 비밀값이 아니라 예외)', () => {
    expect(summarizeFeatures(all)).not.toMatch(/https?:\/\/|eyJ|@/);
  });
});

describe('describeServiceDayBoundary', () => {
  const key = 'SERVICE_DAY_BOUNDARY_05_FROM';
  const original = process.env[key];
  afterEach(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });

  it('전환 env 가 비어 있으면 04:00 — 배포 뒤 기동 로그에서 경계 상태를 바로 읽게', () => {
    delete process.env[key];
    expect(describeServiceDayBoundary()).toBe('04:00');
  });

  it('전환 시각이 있으면 05:00 과 그 시각을 함께 적는다', () => {
    process.env[key] = '2026-10-14T05:00:00+09:00';
    expect(describeServiceDayBoundary()).toBe('05:00@2026-10-13T20:00:00.000Z');
  });
});
