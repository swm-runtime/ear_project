import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import {
  GA4_PROD_STREAM_PREFIX,
  GA4_REALTIME_MAX_MINUTES_AGO,
} from './voc.constant';

type GoogleAuthModule = typeof import('google-auth-library');

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/** GA4 Data API runRealtimeReport 응답에서 우리가 읽는 것 */
interface RealtimeReportResponse {
  rows?: {
    dimensionValues?: { value?: string }[];
    metricValues?: { value?: string }[];
  }[];
}

/** 이벤트가 GA4 에 **도착한** 분 단위 묶음 — `minutesAgo`는 요청 시점 기준 몇 분 전인지 */
export interface RealtimeEventMinute {
  minutesAgo: number;
  platform: string;
  count: number;
}

const ANALYTICS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/analytics.readonly';
const DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';

/**
 * GA4 **실시간** 보고 조회(앱 삭제 알림 — `features/backend-monitoring.md` 3-4).
 *
 * 일일 보고(`admin/ga4.service.ts`)의 gRPC SDK 를 쓰지 않고 **REST 를 직접 부른다** — 그 SDK 는 올리는 것만으로
 * 54MB 를 들고, 15분마다 도는 일이 그걸 상주시킬 이유가 없다. 인증은 결제가 쓰는 `google-auth-library` JWT 로
 * 같은 서비스 계정(`GA4_SERVICE_ACCOUNT_BASE64`)에서 analytics.readonly 토큰을 받는다. 모듈은 처음 쓸 때 로드한다.
 *
 * 실시간 보고는 **최근 30분**만 보이고(`minutesAgo` 0~29) 분 단위로 "도착 시각"을 준다. 호출부는 그 분 단위로
 * 겹치는 창을 걸러 같은 분을 두 번 세지 않는다. 운영 스트림만 본다(`ear prod` 접두 — 일일 보고와 같은 규칙).
 */
@Injectable()
export class Ga4RealtimeClient {
  private readonly logger = new Logger(Ga4RealtimeClient.name);
  private readonly propertyId: string;
  private readonly serviceAccount: ServiceAccountKey | null;
  private authModule: GoogleAuthModule | null = null;
  private apiClient: InstanceType<GoogleAuthModule['JWT']> | null = null;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.propertyId =
      configService.get('GA4_PROPERTY_ID', { infer: true })?.trim() ?? '';
    this.serviceAccount = parseServiceAccount(
      configService
        .get('GA4_SERVICE_ACCOUNT_BASE64', { infer: true })
        ?.trim() ?? '',
    );
  }

  get configured(): boolean {
    return this.propertyId !== '' && this.serviceAccount !== null;
  }

  /**
   * 한 이벤트의 최근 30분 분 단위 건수(플랫폼별). 행이 없으면 빈 배열 — 30분 동안 그 이벤트가 없었다는 뜻이다.
   * 실패는 던진다 — 호출부가 로그로 남기고 다음 주기를 기다린다.
   */
  async fetchEventMinutes(eventName: string): Promise<RealtimeEventMinute[]> {
    const client = this.getApiClient();
    const url = `${DATA_API_BASE}/properties/${encodeURIComponent(this.propertyId)}:runRealtimeReport`;
    const response = await client.request<RealtimeReportResponse>({
      url,
      method: 'POST',
      data: {
        dimensions: [{ name: 'minutesAgo' }, { name: 'platform' }],
        metrics: [{ name: 'eventCount' }],
        minuteRanges: [
          { startMinutesAgo: GA4_REALTIME_MAX_MINUTES_AGO, endMinutesAgo: 0 },
        ],
        dimensionFilter: {
          andGroup: {
            expressions: [
              {
                filter: {
                  fieldName: 'eventName',
                  stringFilter: { matchType: 'EXACT', value: eventName },
                },
              },
              {
                filter: {
                  fieldName: 'streamName',
                  stringFilter: {
                    matchType: 'BEGINS_WITH',
                    value: GA4_PROD_STREAM_PREFIX,
                  },
                },
              },
            ],
          },
        },
      },
    });

    return normalizeRealtimeRows(response.data);
  }

  private loadAuthModule(): GoogleAuthModule {
    if (!this.authModule) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드(클래스 주석)
      this.authModule = require('google-auth-library') as GoogleAuthModule;
      this.logger.log('ga4 realtime auth loaded');
    }

    return this.authModule;
  }

  private getApiClient(): InstanceType<GoogleAuthModule['JWT']> {
    if (!this.apiClient) {
      const { JWT } = this.loadAuthModule();

      this.apiClient = new JWT({
        email: this.serviceAccount!.client_email,
        key: this.serviceAccount!.private_key,
        scopes: [ANALYTICS_READONLY_SCOPE],
      });
    }

    return this.apiClient;
  }
}

/** 응답 행 → 분 단위 묶음. 숫자가 아닌 값은 버린다(GA4 가 `(other)` 같은 묶음 행을 끼울 수 있다) */
export function normalizeRealtimeRows(
  response: RealtimeReportResponse,
): RealtimeEventMinute[] {
  const result: RealtimeEventMinute[] = [];

  for (const row of response.rows ?? []) {
    const minutesAgo = Number(row.dimensionValues?.[0]?.value);
    const platform = row.dimensionValues?.[1]?.value?.trim() || 'unknown';
    const count = Number(row.metricValues?.[0]?.value);

    if (
      !Number.isInteger(minutesAgo) ||
      !Number.isFinite(count) ||
      count <= 0
    ) {
      continue;
    }

    result.push({ minutesAgo, platform, count });
  }

  return result;
}

function parseServiceAccount(base64: string): ServiceAccountKey | null {
  if (base64 === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(base64, 'base64').toString('utf8'),
    ) as Partial<ServiceAccountKey>;

    return parsed.client_email && parsed.private_key
      ? { client_email: parsed.client_email, private_key: parsed.private_key }
      : null;
  } catch {
    return null;
  }
}
