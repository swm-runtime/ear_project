import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { EnvironmentVariables } from '@/config/env.validation';
import { DailyMetricsDbService } from './daily-metrics-db.service';
import { formatDailyMetrics, reportDate } from './daily-metrics.format';
import { Ga4Service } from './ga4.service';

/** Slack 응답 대기 상한 */
const SLACK_TIMEOUT_MS = 5_000;

/**
 * 일일 지표 Slack 보고 (KAN-107 2단계) — **매일 17:00 KST**, 어제 하루치.
 *
 * GA4(운영 스트림) 값을 4묶음으로 적고, 가입만 서버 건수와 대조한다. `ScheduleModule` 은 스케줄러
 * 프로세스에만 올라가므로(`app.module.ts` · `isSchedulerProcess`) 클러스터에서 한 번만 돈다.
 * GA4 자격이나 웹훅이 비면 조용히 건너뛴다 — 로컬·테스트·개발계 기본. 실패해도 던지지
 * 않는다: 던지면 스케줄러가 멈추고 다음 날도 안 온다.
 *
 * **크론으로만 나간다**(2026-10-02) — 수동 발송 엔드포인트는 없앴다. 요청을 받은 워커가 GA4 SDK 를
 * 올려 재기동까지 들고 있었고(`ga4.service.ts` 의 지연 로드가 피하려던 상태), 누를 때마다 같은 보고가
 * 채널에 중복 게시됐다.
 */
@Injectable()
export class DailyMetricsScheduler {
  private readonly logger = new Logger(DailyMetricsScheduler.name);
  private readonly webhookUrl: string;
  private readonly environment: string;

  constructor(
    private readonly ga4: Ga4Service,
    private readonly db: DailyMetricsDbService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    // 가입 알림과 같은 채널 — 전용 값이 있으면 그것, 없으면 기존 알림 채널
    this.webhookUrl =
      configService.get('SLACK_SIGNUP_WEBHOOK_URL', { infer: true })?.trim() ||
      configService.get('SLACK_ERROR_WEBHOOK_URL', { infer: true })?.trim() ||
      '';
    this.environment =
      configService.get('SENTRY_ENVIRONMENT', { infer: true }) ?? '';
  }

  /** GA4 자격과 웹훅이 모두 있어야 돈다 — 하나라도 비면 크론이 조용히 건너뛴다 */
  get configured(): boolean {
    return this.ga4.enabled && this.webhookUrl !== '';
  }

  @Cron('0 17 * * *', { name: 'daily-metrics', timeZone: 'Asia/Seoul' })
  async run(): Promise<void> {
    if (!this.configured) {
      this.logger.log('daily metrics skipped (ga4 or webhook not configured)');
      return;
    }
    await this.report(reportDate(new Date()));
  }

  private async report(date: string): Promise<void> {
    try {
      // GA4 와 서버를 나란히 부른다 — 서로 기다릴 이유가 없다
      const [g, s] = await Promise.all([
        this.ga4.fetchDaily(date),
        this.db.fetchDaily(date),
      ]);
      const text = formatDailyMetrics(
        {
          date,
          users: g.users,
          acquisition: {
            signUps: g.events.sign_up.count,
            serverSignUps: s.signUps,
            onboardingCompletes: g.events.onboarding_complete.count,
            pushResponses: g.events.push_permission.count,
            withdrawals: g.events.withdrawal.count,
          },
          playback: {
            playStarts: g.events.play_start.count,
            playStartUsers: g.events.play_start.users,
            completes: g.events.play_complete.count,
            abandons: g.events.play_abandon.count,
            dripPlays: g.events.drip_play.count,
            saves: g.events.content_save.count,
          },
          retention: g.retention,
        },
        this.environment,
      );
      await this.post(text);
      this.logger.log('daily metrics posted', { date });
    } catch (error) {
      this.logger.error(
        'daily metrics failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async post(text: string): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`slack webhook ${res.status}`);
  }
}
