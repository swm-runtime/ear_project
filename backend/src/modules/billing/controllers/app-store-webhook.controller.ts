import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { AppStoreNotificationRequestDto } from '../dto/app-store-notification-request.dto';
import { AppStoreWebhookService } from '../services/app-store-webhook.service';

/**
 * subscription-api.md 4.6 — Apple이 호출한다.
 *
 * **사용자 인증이 없다**(`JwtAuthGuard`를 걸지 않는다). 호출자를 믿는 근거는 본문의 서명이다 — 검증 전에는
 * 본문을 믿지 않는다(7장). 레이트 리밋도 제외한다: 호출자가 스토어 한 곳이라 사용자 한도 대상이 아니고,
 * 한도에 걸려 4xx를 주면 Apple의 재시도가 갱신·환불 반영을 늦춘다.
 */
@SkipThrottle()
@Controller('webhooks/app-store')
export class AppStoreWebhookController {
  constructor(
    private readonly appStoreWebhookService: AppStoreWebhookService,
  ) {}

  /** 처리 성공(또는 이미 처리한 알림)이면 200 빈 본문. 그 밖의 응답은 Apple의 재시도를 부른다 */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() request: AppStoreNotificationRequestDto,
  ): Promise<void> {
    await this.appStoreWebhookService.handle(request.signedPayload, new Date());
  }
}
