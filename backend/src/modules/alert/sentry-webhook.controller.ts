import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { SentryWebhookService } from './sentry-webhook.service';

/**
 * Sentry 가 호출한다 — `POST /api/v1/webhooks/sentry`(서명 검증) 또는 `POST /api/v1/webhooks/sentry/<토큰>`(종전,
 * `sentry-webhook.service.ts`).
 *
 * **사용자 인증이 없다.** 호출자 판별은 Sentry 가 보내는 `Sentry-Hook-Signature`(본문의 HMAC-SHA256, 키 = Internal
 * Integration 의 Client Secret) 또는 주소의 토큰이다. 레이트 리밋도 제외한다 — 호출자가 Sentry 한 곳이고 알림이 429 로
 * 막히면 그 이슈는 영영 모른다. 본문은 Sentry 모양 그대로 받는다(DTO 없음 — `format.ts` 머리말).
 *
 * 인증이 맞지 않으면 404 — 존재 자체를 숨긴다. 맞으면 본문이 무엇이든 204 (Sentry 는 1초 안에 응답이 없으면
 * 타임아웃으로 치고 24시간에 1,000회면 웹훅을 끊는다 — 중계는 응답 뒤 비동기다).
 */
@SkipThrottle()
@Controller('webhooks/sentry')
export class SentryWebhookController {
  constructor(private readonly sentryWebhookService: SentryWebhookService) {}

  /** 서명 검증 주소 — Client Secret 이 있을 때만 열린다 */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  receiveSigned(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('sentry-hook-signature') signature: string | undefined,
    @Body() body: unknown,
  ): void {
    this.accept(
      this.sentryWebhookService.isValidSignature(request.rawBody, signature),
      body,
    );
  }

  /** 종전 경로 토큰 주소 — 토큰이 맞거나, 서명이 맞으면 받는다(주소 교체 기간) */
  @Post(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  receive(
    @Param('token') token: string,
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('sentry-hook-signature') signature: string | undefined,
    @Body() body: unknown,
  ): void {
    this.accept(
      this.sentryWebhookService.isValidToken(token) ||
        this.sentryWebhookService.isValidSignature(request.rawBody, signature),
      body,
    );
  }

  private accept(authorized: boolean, body: unknown): void {
    if (!authorized) {
      throw new NotFoundException();
    }
    this.sentryWebhookService.relay(body);
  }
}
