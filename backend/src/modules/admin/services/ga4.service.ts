import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import {
  parseEventCount,
  parseRetention,
  parseTotals,
  ReportRow,
} from './ga4-report.parse';

/**
 * GA4 Data API 호출부 (KAN-107 2단계).
 *
 * **SDK 는 실행 시점에 지연 로드한다.** `@google-analytics/data` 는 gRPC 기반이라 require
 * 만으로 RSS 가 40MB, 클라이언트까지 54MB 늘어난다(2026-09-29 실측). 하루 한 번 도는 일에
 * 워커 2개가 24시간 108MB 를 내주는 것은 t4g.small 에서 감당할 비용이 아니다. 지연 로드하면
 * 스케줄러 워커 하나가 첫 실행 뒤에만 54MB 를 들고, 배포 재기동 때 해제된다.
 *
 * 자격은 서비스 계정 JSON 을 base64 로 env 에 둔다(`CLOUDFRONT_PRIVATE_KEY_BASE64` 와 같은
 * 방식). 둘 중 하나라도 비면 꺼진 상태다 — 로컬·테스트 기본.
 */

/** GA4 는 첫 세션 날짜 기준으로 코호트를 자른다 */
const COHORT_DIMENSION = 'firstSessionDate';

type Client = {
  runReport(request: object): Promise<[{ rows?: ReportRow[] | null }]>;
};

export type Ga4Daily = {
  activeUsers: number;
  newUsers: number;
  signUps: number;
  retention: { d1: number | null; d7: number | null };
};

/** `YYYY-MM-DD` 에 일수를 더한다 — 코호트 기준일 계산용 */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class Ga4Service {
  private readonly logger = new Logger(Ga4Service.name);
  private readonly propertyId: string;
  private readonly credentialsBase64: string;
  private client: Client | null = null;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.propertyId =
      configService.get('GA4_PROPERTY_ID', { infer: true })?.trim() ?? '';
    this.credentialsBase64 =
      configService
        .get('GA4_SERVICE_ACCOUNT_BASE64', { infer: true })
        ?.trim() ?? '';
  }

  get enabled(): boolean {
    return this.propertyId !== '' && this.credentialsBase64 !== '';
  }

  /**
   * 하루치 지표. `date` 는 보고 대상 날짜(어제)다.
   *
   * 리텐션의 기준일: D1 은 `date - 1` 에 처음 온 사람이 `date` 에 돌아왔는가, D7 은 `date - 7`
   * 에 처음 온 사람이 `date` 에 돌아왔는가 — 둘 다 **완결된 하루(`date`)를 측정일**로 둔다.
   * 첫 실행 뒤 GA4 콘솔의 리텐션 보고서와 한 번 대조할 것 — 코호트 오프셋은 실데이터 없이
   * 확정할 수 없다.
   */
  async fetchDaily(date: string): Promise<Ga4Daily> {
    const client = this.getClient();
    const property = `properties/${this.propertyId}`;
    const day = { startDate: date, endDate: date };

    const [[totals], [events], [cohorts]] = await Promise.all([
      client.runReport({
        property,
        dateRanges: [day],
        metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }],
      }),
      client.runReport({
        property,
        dateRanges: [day],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { matchType: 'EXACT', value: 'sign_up' },
          },
        },
      }),
      client.runReport({
        property,
        dimensions: [{ name: 'cohort' }, { name: 'cohortNthDay' }],
        metrics: [{ name: 'cohortActiveUsers' }, { name: 'cohortTotalUsers' }],
        cohortSpec: {
          cohorts: [
            {
              name: 'd1',
              dimension: COHORT_DIMENSION,
              dateRange: {
                startDate: shiftDate(date, -1),
                endDate: shiftDate(date, -1),
              },
            },
            {
              name: 'd7',
              dimension: COHORT_DIMENSION,
              dateRange: {
                startDate: shiftDate(date, -7),
                endDate: shiftDate(date, -7),
              },
            },
          ],
          cohortsRange: { granularity: 'DAILY', startOffset: 0, endOffset: 7 },
        },
      }),
    ]);

    const { activeUsers, newUsers } = parseTotals(totals.rows);
    const retention = parseRetention(cohorts.rows, [
      { name: 'd1', nthDay: 1 },
      { name: 'd7', nthDay: 7 },
    ]);
    return {
      activeUsers,
      newUsers,
      signUps: parseEventCount(events.rows, 'sign_up'),
      retention: { d1: retention.d1 ?? null, d7: retention.d7 ?? null },
    };
  }

  private getClient(): Client {
    if (this.client) return this.client;
    // 지연 로드 — 위 주석. 함수 안의 require 는 첫 호출 때만 평가된다
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BetaAnalyticsDataClient } = require('@google-analytics/data') as {
      BetaAnalyticsDataClient: new (opts: { credentials: object }) => Client;
    };
    const credentials = JSON.parse(
      Buffer.from(this.credentialsBase64, 'base64').toString('utf8'),
    ) as object;
    this.client = new BetaAnalyticsDataClient({ credentials });
    this.logger.log('ga4 client loaded');
    return this.client;
  }
}
