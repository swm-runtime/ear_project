import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { isSchedulerProcess } from '@/common/cluster.util';
import { EnvironmentVariables } from '@/config/env.validation';

/**
 * 기동 요약 — **지금 이 프로세스에 무엇이 켜져 있는가**를 한 줄로.
 *
 * 외부 연동(Slack·GA4·Sentry)은 전부 "env 가 있으면 켜짐"이라 조용히 켜지고 꺼진다. 그래서
 * 장애 때마다 "개발계 웹훅이 비어 있나?", "GA4 키가 들어갔나?"를 Secrets 를 뒤져 확인해야
 * 했다(2026-09-29 실제로 반나절). 켜짐 로그는 서비스마다 흩어져 있어(20여 곳) 한눈에 안 보인다.
 * 이 한 줄이 그 질문의 답이다 — 배포 뒤 기동 로그에서 이 줄만 보면 된다.
 *
 * 값을 찍지 않는다. 있는지 없는지만 찍는다.
 */

export type FeatureInputs = {
  environment: string;
  scheduler: boolean;
  sentry: boolean;
  resourceAlert: boolean;
  signupAlert: boolean;
  dailyMetrics: boolean;
  /** 스토어 리뷰 폴링(KAN-133) — 켜진 스토어가 하나라도 있고 웹훅이 있을 때 */
  vocReview: boolean;
  /** 앱 삭제 알림(GA4 app_remove) — GA4 자격과 웹훅이 있을 때 */
  appRemoveAlert: boolean;
  /** 이 프로세스에 등록된 크론 이름 — 스케줄러 프로세스가 아니면 빈 배열 */
  crons: string[];
};

const onOff = (v: boolean): string => (v ? 'on' : 'off');

/** 순수 함수 — 문구를 테스트로 고정한다 */
export function summarizeFeatures(f: FeatureInputs): string {
  const crons = f.crons.length ? `[${[...f.crons].sort().join(',')}]` : '[]';
  return (
    `features env=${f.environment || '-'} scheduler=${f.scheduler ? 'yes' : 'no'} ` +
    `sentry=${onOff(f.sentry)} resource-alert=${onOff(f.resourceAlert)} ` +
    `signup-alert=${onOff(f.signupAlert)} daily-metrics=${onOff(f.dailyMetrics)} ` +
    `voc-review=${onOff(f.vocReview)} app-remove-alert=${onOff(f.appRemoveAlert)} ` +
    `crons=${crons}`
  );
}

@Injectable()
export class StartupSummary implements OnApplicationBootstrap {
  private readonly logger = new Logger('Startup');

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    // 스케줄러 프로세스에서만 ScheduleModule 이 올라온다 — 없으면 undefined
    @Optional() private readonly registry?: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    // 일부 env 는 숫자 타입이라 문자열로 바꿔 본다 — 있는지만 본다
    const has = (key: keyof EnvironmentVariables): boolean =>
      String(this.config.get(key, { infer: true }) ?? '').trim() !== '';
    const errorHook = has('SLACK_ERROR_WEBHOOK_URL');
    const anyHook = has('SLACK_SIGNUP_WEBHOOK_URL') || errorHook;
    const crons = this.registry ? [...this.registry.getCronJobs().keys()] : [];
    this.logger.log(
      summarizeFeatures({
        environment:
          this.config.get('SENTRY_ENVIRONMENT', { infer: true }) ?? '',
        scheduler: isSchedulerProcess(),
        sentry: has('SENTRY_DSN'),
        resourceAlert: errorHook,
        signupAlert: anyHook,
        // 일일 보고는 스케줄러 프로세스에서만 실제로 돈다 — 다른 워커에서는 자격이 있어도 off 로 적는다
        dailyMetrics:
          isSchedulerProcess() &&
          anyHook &&
          has('GA4_PROPERTY_ID') &&
          has('GA4_SERVICE_ACCOUNT_BASE64'),
        vocReview:
          isSchedulerProcess() &&
          anyHook &&
          ((has('APP_STORE_CONNECT_ISSUER_ID') &&
            has('APP_STORE_CONNECT_KEY_ID') &&
            has('APP_STORE_CONNECT_PRIVATE_KEY_BASE64') &&
            has('APP_STORE_APP_APPLE_ID')) ||
            (has('GOOGLE_PLAY_PACKAGE_NAME') &&
              has('GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64'))),
        appRemoveAlert:
          isSchedulerProcess() &&
          anyHook &&
          has('GA4_PROPERTY_ID') &&
          has('GA4_SERVICE_ACCOUNT_BASE64'),
        crons,
      }),
    );
  }
}
