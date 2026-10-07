import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { equalsInConstantTime } from '@/common/utils/hash.util';
import { EnvironmentVariables } from '@/config/env.validation';

import {
  formatSentryIssueText,
  parseSentryWebhook,
} from './sentry-webhook.format';
import { SlackAlertService } from './slack-alert.service';

/**
 * Sentry 레거시 웹훅 수신 → Slack 릴레이(`sentry-webhook.format.ts` 머리말).
 *
 * **호출자를 믿는 근거는 주소에 든 토큰 하나다.** 레거시 웹훅은 서명 헤더가 없어서, URL 경로의 토큰
 * (`SENTRY_WEBHOOK_TOKEN`, 16자 이상)을 상수 시간으로 대조한다. 토큰이 비어 있으면 기능이 꺼진 것이고
 * 어떤 요청도 404 다 — 주소를 아는 사람만 Slack 에 글을 쓸 수 있고, 그마저 문구는 서버가 만든다.
 */
@Injectable()
export class SentryWebhookService {
  private readonly logger = new Logger(SentryWebhookService.name);
  private readonly token: string;

  constructor(
    configService: ConfigService<EnvironmentVariables, true>,
    private readonly slackAlertService: SlackAlertService,
  ) {
    this.token =
      configService.get('SENTRY_WEBHOOK_TOKEN', { infer: true })?.trim() ?? '';
  }

  /** 켜져 있는지 — 토큰이 있고 Slack 웹훅도 있어야 실제로 흘러간다 */
  get enabled(): boolean {
    return this.token !== '' && this.slackAlertService.enabled;
  }

  /** 주소의 토큰이 맞는가. 토큰이 비어 있으면(기능 꺼짐) 항상 거짓 */
  isValidToken(candidate: string): boolean {
    return this.token !== '' && equalsInConstantTime(this.token, candidate);
  }

  /**
   * 본문을 문구로 바꿔 Slack 에 보낸다(fire-and-forget). 못 읽는 본문은 debug 한 줄로 버린다 —
   * Sentry 의 "Send Test Event" 도 같은 모양으로 오므로 정상 경로다.
   */
  relay(body: unknown): void {
    const notice = parseSentryWebhook(body);
    if (!notice) {
      this.logger.debug('sentry webhook ignored — no title in payload');
      return;
    }
    this.slackAlertService.notify(
      'sentry-issue',
      formatSentryIssueText(notice),
    );
  }
}
