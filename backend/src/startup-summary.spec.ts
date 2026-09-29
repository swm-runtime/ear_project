import { summarizeFeatures } from './startup-summary';

describe('summarizeFeatures', () => {
  const all = {
    environment: 'production',
    scheduler: true,
    sentry: true,
    resourceAlert: true,
    signupAlert: true,
    dailyMetrics: true,
    crons: ['push-receipt', 'daily-metrics', 'content-stat-aggregation'],
  };

  it('한 줄에 전부 담고 크론 이름은 정렬한다 — 배포마다 비교하기 쉽게', () => {
    expect(summarizeFeatures(all)).toBe(
      'features env=production scheduler=yes sentry=on resource-alert=on signup-alert=on daily-metrics=on crons=[content-stat-aggregation,daily-metrics,push-receipt]',
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

  it('값을 찍지 않는다 — 있는지 없는지만', () => {
    expect(summarizeFeatures(all)).not.toMatch(/https?:\/\/|eyJ|@/);
  });
});
