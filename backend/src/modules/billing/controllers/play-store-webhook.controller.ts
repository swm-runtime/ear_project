import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { PlayStoreWebhookService } from '../services/play-store-webhook.service';

/**
 * subscription-api.md 4.7 — Google Cloud Pub/Sub의 push 구독이 호출한다.
 *
 * **사용자 인증이 없다**(`JwtAuthGuard`를 걸지 않는다). 호출자를 믿는 근거는 `Authorization` 헤더의 OIDC 토큰이다 —
 * Google 공개키로 서명을 확인하고 대상(`aud`)과 발신 서비스 계정을 대조한다(7장). 레이트 리밋을 제외하는 이유는
 * App Store 웹훅과 같다: 한도에 걸려 4xx를 주면 재전송이 갱신·환불 반영을 늦춘다.
 *
 * 본문은 DTO로 받지 않는다(`PlayStoreWebhookService`의 `parseEnvelope` 주석).
 */
@SkipThrottle()
@Controller('webhooks/play-store')
export class PlayStoreWebhookController {
  constructor(
    private readonly playStoreWebhookService: PlayStoreWebhookService,
  ) {}

  /** 처리 성공(또는 이미 처리한 알림)이면 200 빈 본문. 그 밖의 응답은 Pub/Sub의 재전송을 부른다 */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<void> {
    await this.playStoreWebhookService.handle(authorization, body, new Date());
  }
}
