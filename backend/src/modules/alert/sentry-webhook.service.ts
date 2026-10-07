import { createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { equalsInConstantTime } from '@/common/utils/hash.util';
import { EnvironmentVariables } from '@/config/env.validation';

import { SentryIssueClient } from './sentry-issue.client';
import {
  formatSentryIssueText,
  parseSentryWebhook,
} from './sentry-webhook.format';
import { SlackAlertService } from './slack-alert.service';

/**
 * Sentry 웹훅 수신 → Slack 릴레이(`sentry-webhook.format.ts` 머리말).
 *
 * **호출자를 믿는 근거는 둘 중 하나다**(`backend-monitoring.md` 3-2, 2026-10-07 개정).
 * - **서명**(권장): Sentry Internal Integration 은 웹훅마다 `Sentry-Hook-Signature` — 받은 본문 그대로의 HMAC-SHA256(16진수),
 *   키는 그 통합의 Client Secret — 를 보낸다. `SENTRY_WEBHOOK_SECRET`으로 대조한다. 비밀이 요청에 드러나지 않는다.
 * - **경로 토큰**(종전): URL 경로의 `SENTRY_WEBHOOK_TOKEN`(16자 이상). 요청 로그에 경로가 남아 서버 로그에서는 가린다
 *   (`redact-url.util.ts`) — Caddy 접근 로그에는 남으므로 서명 쪽으로 옮기는 것을 권한다.
 *
 * 둘 다 상수 시간으로 대조한다. 둘 다 비어 있으면 기능이 꺼진 것이고 어떤 요청도 404 다 — 비밀을 아는 쪽만 Slack 에
 * 글을 쓸 수 있고, 그마저 문구는 서버가 만든다.
 */
@Injectable()
export class SentryWebhookService {
  private readonly logger = new Logger(SentryWebhookService.name);
  private readonly token: string;
  private readonly secret: string;

  constructor(
    configService: ConfigService<EnvironmentVariables, true>,
    private readonly slackAlertService: SlackAlertService,
    private readonly sentryIssueClient: SentryIssueClient,
  ) {
    this.token =
      configService.get('SENTRY_WEBHOOK_TOKEN', { infer: true })?.trim() ?? '';
    this.secret =
      configService.get('SENTRY_WEBHOOK_SECRET', { infer: true })?.trim() ?? '';
  }

  /** 켜져 있는지 — 토큰이나 비밀이 있고 Slack 웹훅도 있어야 실제로 흘러간다 */
  get enabled(): boolean {
    return (
      (this.token !== '' || this.secret !== '') &&
      this.slackAlertService.enabled
    );
  }

  /** 주소의 토큰이 맞는가. 토큰이 비어 있으면(그 방식 꺼짐) 항상 거짓 */
  isValidToken(candidate: string): boolean {
    return this.token !== '' && equalsInConstantTime(this.token, candidate);
  }

  /**
   * `Sentry-Hook-Signature`가 받은 본문의 HMAC-SHA256(Client Secret)과 같은가. 비밀이 비어 있거나(그 방식 꺼짐)
   * 원문 본문·헤더가 없으면 거짓. 비교는 상수 시간이다
   */
  isValidSignature(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): boolean {
    if (this.secret === '' || !rawBody || !signature) {
      return false;
    }

    const expected = createHmac('sha256', this.secret)
      .update(rawBody)
      .digest('hex');

    return equalsInConstantTime(expected, signature.trim().toLowerCase());
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

    // 이슈 단위 값(State · First Seen · 건수)은 Issue API 에만 있다 — 조회가 실패·지연해도 알림은 나간다(클라이언트 주석).
    // 응답(200)은 이미 나갔으므로 여기서 기다려도 Sentry 재시도를 부르지 않는다
    void (
      notice.issueId
        ? this.sentryIssueClient.fetch(notice.issueId)
        : Promise.resolve(null)
    ).then((extra) => {
      this.slackAlertService.notify(
        'sentry-issue',
        formatSentryIssueText(notice, extra),
      );
    });
  }
}
