import { DailyMetricsDbService } from './daily-metrics-db.service';
import { DailyMetricsScheduler } from './daily-metrics.scheduler';
import { Ga4Daily, Ga4Service } from './ga4.service';

const config = (values: Record<string, string | undefined>) =>
  ({ get: jest.fn((key: string) => values[key]) }) as never;
const NOW = new Date('2026-09-29T08:00:00Z'); // 17:00 KST → 보고 대상 09-28
const GA4_OK = config({
  GA4_PROPERTY_ID: '123',
  GA4_SERVICE_ACCOUNT_BASE64: 'e30=',
});
const db = (signUps = 0) =>
  ({
    fetchDaily: jest.fn().mockResolvedValue({ signUps }),
  }) as unknown as DailyMetricsDbService;

const ev = (count = 0, users = 0) => ({ count, users });
const sample: Ga4Daily = {
  users: {
    active: 10,
    activePrev: 8,
    new: 2,
    newPrev: 2,
    sessions: 12,
    avgSessionSec: 90,
    active7d: 30,
  },
  events: {
    sign_up: ev(3),
    onboarding_complete: ev(1),
    push_permission: ev(1),
    withdrawal: ev(0),
    play_start: ev(4, 3),
    play_complete: ev(5),
    play_abandon: ev(2),
    drip_play: ev(1),
    content_save: ev(2),
  },
  retention: { d1: { rate: 0.5, size: 2 }, d7: { rate: null, size: 0 } },
};

describe('DailyMetricsScheduler', () => {
  afterEach(() => jest.restoreAllMocks());

  it('GA4 자격이 없으면 configured 가 아니고 run 은 아무것도 보내지 않는다', async () => {
    const scheduler = new DailyMetricsScheduler(
      new Ga4Service(config({})),
      db(),
      config({ SLACK_ERROR_WEBHOOK_URL: 'https://hook' }),
    );
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    expect(scheduler.configured).toBe(false);
    await scheduler.run();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('웹훅이 없으면 자격이 있어도 configured 가 아니다', () => {
    expect(
      new DailyMetricsScheduler(new Ga4Service(GA4_OK), db(), config({}))
        .configured,
    ).toBe(false);
  });

  it('GA4 값으로 보낸다 — 가입·완청도 GA4 이고, 서버 가입 건수는 다를 때만 괄호로 붙는다', async () => {
    const ga4 = new Ga4Service(GA4_OK);
    jest.spyOn(ga4, 'fetchDaily').mockResolvedValue(sample);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    const scheduler = new DailyMetricsScheduler(
      ga4,
      // 서버 가입 2 — GA4 `sign_up` 3 과 다르다
      db(2),
      config({
        SLACK_ERROR_WEBHOOK_URL: 'https://hook',
        SENTRY_ENVIRONMENT: 'development',
      }),
    );

    expect(scheduler.trigger(NOW)).toBe('2026-09-28');
    await new Promise((r) => setImmediate(r));

    expect(ga4.fetchDaily).toHaveBeenCalledWith('2026-09-28');
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as { text: string };
    expect(body.text).toMatch(/^\[development\] /);
    expect(body.text).toContain('가입 3 (서버 2) → 온보딩 완료 1 (33%)');
    expect(body.text).toContain('완청 5');
    expect(body.text).toContain('시작 4 (3명)');
    expect(body.text).toContain('활성 10 (▲2)');
    expect(body.text).toContain('D1 50% (2명 중 1)  ·  D7 — (표본 없음)');
  });

  it('GA4 가 실패해도 던지지 않는다 — 던지면 스케줄러가 멈춘다', async () => {
    const ga4 = new Ga4Service(GA4_OK);
    jest.spyOn(ga4, 'fetchDaily').mockRejectedValue(new Error('quota'));
    const scheduler = new DailyMetricsScheduler(
      ga4,
      db(),
      config({ SLACK_ERROR_WEBHOOK_URL: 'https://hook' }),
    );
    await expect(scheduler.run()).resolves.toBeUndefined();
  });
});
