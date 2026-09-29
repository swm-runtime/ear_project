import { DailyMetricsScheduler } from './daily-metrics.scheduler';
import { Ga4Service } from './ga4.service';

/** ConfigService 목 — 키→값 사전 */
const config = (values: Record<string, string | undefined>) =>
  ({ get: jest.fn((key: string) => values[key]) }) as never;

const NOW = new Date('2026-09-29T08:00:00Z'); // 17:00 KST → 보고 대상은 09-28

describe('DailyMetricsScheduler', () => {
  afterEach(() => jest.restoreAllMocks());

  it('GA4 자격이 없으면 configured 가 아니고 run 은 아무것도 보내지 않는다', async () => {
    const ga4 = new Ga4Service(config({}));
    const scheduler = new DailyMetricsScheduler(
      ga4,
      config({ SLACK_ERROR_WEBHOOK_URL: 'https://hook' }),
    );
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    expect(scheduler.configured).toBe(false);
    await scheduler.run();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('웹훅이 없으면 자격이 있어도 configured 가 아니다', () => {
    const ga4 = new Ga4Service(
      config({ GA4_PROPERTY_ID: '123', GA4_SERVICE_ACCOUNT_BASE64: 'e30=' }),
    );
    expect(new DailyMetricsScheduler(ga4, config({})).configured).toBe(false);
  });

  it('trigger 는 어제(KST) 날짜를 돌려주고 보고를 뒤에서 시작한다', async () => {
    const ga4 = new Ga4Service(
      config({ GA4_PROPERTY_ID: '123', GA4_SERVICE_ACCOUNT_BASE64: 'e30=' }),
    );
    jest.spyOn(ga4, 'fetchDaily').mockResolvedValue({
      activeUsers: 10,
      newUsers: 2,
      signUps: 1,
      retention: { d1: 0.5, d7: null },
    });
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    const scheduler = new DailyMetricsScheduler(
      ga4,
      config({
        SLACK_ERROR_WEBHOOK_URL: 'https://hook',
        SENTRY_ENVIRONMENT: 'development',
      }),
    );

    expect(scheduler.trigger(NOW)).toBe('2026-09-28');
    await new Promise((r) => setImmediate(r)); // 백그라운드 보고가 돌 시간

    expect(ga4.fetchDaily).toHaveBeenCalledWith('2026-09-28');
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as { text: string };
    expect(body.text).toMatch(/^\[development\] /);
    expect(body.text).toContain('2026-09-28 지표');
    expect(body.text).toContain('D1 50.0% · D7 —');
  });

  it('GA4 가 실패해도 던지지 않는다 — 던지면 스케줄러가 멈춘다', async () => {
    const ga4 = new Ga4Service(
      config({ GA4_PROPERTY_ID: '123', GA4_SERVICE_ACCOUNT_BASE64: 'e30=' }),
    );
    jest.spyOn(ga4, 'fetchDaily').mockRejectedValue(new Error('quota'));
    const scheduler = new DailyMetricsScheduler(
      ga4,
      config({ SLACK_ERROR_WEBHOOK_URL: 'https://hook' }),
    );
    await expect(scheduler.run()).resolves.toBeUndefined();
  });
});
