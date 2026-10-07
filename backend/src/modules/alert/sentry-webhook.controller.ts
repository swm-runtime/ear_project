import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { SentryWebhookService } from './sentry-webhook.service';

/**
 * Sentry 가 호출한다 — `POST /api/v1/webhooks/sentry/<토큰>`(`sentry-webhook.service.ts`).
 *
 * **사용자 인증이 없다.** 호출자 판별은 주소의 토큰이다. 레이트 리밋도 제외한다 — 호출자가 Sentry 한 곳이고
 * 알림이 429 로 막히면 그 이슈는 영영 모른다. 본문은 Sentry 모양 그대로 받는다(DTO 없음 — `format.ts` 머리말).
 *
 * 토큰이 틀리면 404 — 존재 자체를 숨긴다. 맞으면 본문이 무엇이든 204 (Sentry 는 2xx 가 아니면 재시도하고
 * 실패가 쌓이면 웹훅을 꺼 버린다).
 */
@SkipThrottle()
@Controller('webhooks/sentry')
export class SentryWebhookController {
  constructor(private readonly sentryWebhookService: SentryWebhookService) {}

  @Post(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  receive(@Param('token') token: string, @Body() body: unknown): void {
    if (!this.sentryWebhookService.isValidToken(token)) {
      throw new NotFoundException();
    }
    this.sentryWebhookService.relay(body);
  }
}
