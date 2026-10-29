import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  RATE_LIMIT_INVITE_CODE_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '@/common/rate-limit.constant';
import { SaveContentReviewRequestDto } from '@/modules/content-review/dto/save-content-review-request.dto';
import { toUserMarket } from '@/modules/user/policies/market.policy';

import { PromotionsResponseDto } from '../dto/promotions-response.dto';
import { SaveContentReviewResponseDto } from '../dto/save-content-review-response.dto';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';
import { PromotionOrchestrator } from '../promotion.orchestrator';

/**
 * content-review-api.md 4.6 · 4.7 — 설정 › [프로모션](S12). 후기 스위치가 꺼져 있어도 열려 있다(가진 프로모션은 쓸 수 있다).
 */
@Controller('users/me/promotions')
@UseGuards(JwtAuthGuard)
export class PromotionController {
  constructor(private readonly promotionOrchestrator: PromotionOrchestrator) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<PromotionsResponseDto> {
    return PromotionsResponseDto.from(
      await this.promotionOrchestrator.listPromotions(
        currentUser.id,
        new Date(),
      ),
    );
  }

  /**
   * 확인 팝업의 [쓰기] — 응답은 구독 조회와 같은 본문이라 앱이 다시 부르지 않는다. 멱등키가 없다 — 프로모션 행 잠금으로 한 번만
   * 지급되고 재전송은 409 `PROMOTION_ALREADY_USED`다. 사용자 단위 분당 10회(초대 코드 입력과 같다).
   */
  @Post(':promotionId/redeem')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({
    default: {
      limit: RATE_LIMIT_INVITE_CODE_PER_MINUTE,
      ttl: RATE_LIMIT_WINDOW_MS,
    },
  })
  async redeem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.promotionOrchestrator.redeem(
        currentUser.id,
        promotionId,
        new Date(),
      ),
    );
  }
}

/**
 * content-review-api.md 4.2 — 후기 저장(덮어쓰기). 같은 경로의 시트 열기(GET)는 `content-review` 모듈에 있다. 저장만 여기 있는
 * 이유: 응답의 `issued_promotion`(쓸 수 있는지 · 사유 · 요금제 이름 · 체험 겹침)이 구독 상태로 조립되는데 `content-review`는
 * `subscription`을 의존하지 않는다(domain.md 2장). 저장 판정 · 발급 자체는 `ContentReviewService`가 한다.
 *
 * **멱등키가 없다** — `(user_id, content_id)` upsert 라 재전송이 같은 상태로 수렴하고, 발급은 유니크로 1장이다.
 */
@Controller('contents/:contentId/review')
@UseGuards(JwtAuthGuard)
export class ContentReviewSaveController {
  constructor(private readonly promotionOrchestrator: PromotionOrchestrator) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async save(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() request: SaveContentReviewRequestDto,
  ): Promise<SaveContentReviewResponseDto> {
    return SaveContentReviewResponseDto.from(
      await this.promotionOrchestrator.saveContentReview({
        userId: currentUser.id,
        contentId,
        market: toUserMarket(currentUser.market),
        stars: request.stars,
        text: request.text,
        now: new Date(),
      }),
    );
  }
}
