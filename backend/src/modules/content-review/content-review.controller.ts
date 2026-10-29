import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { toUserMarket } from '@/modules/user/policies/market.policy';

import { ContentReviewService } from './content-review.service';
import { ContentReviewPromptResponseDto } from './dto/content-review-prompt-response.dto';
import { ContentReviewSheetResponseDto } from './dto/content-review-sheet-response.dto';

/**
 * content-review-api.md 4.1 — 더보기 시트 [후기] · 콘텐츠 상세 "내 후기"를 열 때.
 *
 * 경로는 `/contents/:contentId/review` — 콘텐츠에 대한 행위가 모이는 계층(`play` · `save`)과 같다. 단건 상세
 * (`GET /contents/:contentId`)와 세그먼트 수가 달라 라우트가 겹치지 않는다. uuid 가 아니면 `ParseUUIDPipe`가 400.
 *
 * 같은 경로의 저장(PUT, 4.2)은 `billing`의 `ContentReviewSaveController`가 받는다 — 응답의 발급 프로모션이 구독 상태로
 * 조립되기 때문이다(`ContentReviewModule` 설명).
 */
@Controller('contents/:contentId/review')
@UseGuards(JwtAuthGuard)
export class ContentReviewController {
  constructor(private readonly contentReviewService: ContentReviewService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async getSheet(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<ContentReviewSheetResponseDto> {
    return ContentReviewSheetResponseDto.from(
      await this.contentReviewService.getSheet(
        currentUser.id,
        contentId,
        toUserMarket(currentUser.market),
        new Date(),
      ),
    );
  }
}

/**
 * content-review-api.md 4.3 ~ 4.5 — 라이브러리 진입 때의 "다 들은 편, 어떠셨어요?". 추천 별점
 * (`/users/me/drip-feedback/prompt`)과 나란히 부르지만 판정 · 상태 칸이 따로다.
 */
@Controller('users/me/content-review/prompt')
@UseGuards(JwtAuthGuard)
export class ContentReviewPromptController {
  constructor(private readonly contentReviewService: ContentReviewService) {}

  /** 판정 + 켜짐 여부(`enabled` — 앱이 [후기]를 그릴지 정하는 곳). 상태를 바꾸지 않는다 */
  @Get()
  @Header('Cache-Control', 'no-store')
  async prompt(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ContentReviewPromptResponseDto> {
    return ContentReviewPromptResponseDto.from(
      await this.contentReviewService.getPrompt(
        currentUser.id,
        toUserMarket(currentUser.market),
        new Date(),
      ),
    );
  }

  /** 시트가 닫힐 때 한 번 — 오늘을 "물었다"로 적는다. 절대값 저장이라 재전송이 무해하다 */
  @Post('dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  async dismiss(@CurrentUser() currentUser: AuthenticatedUser): Promise<void> {
    await this.contentReviewService.dismissPrompt(currentUser.id, new Date());
  }

  /** 이번 주 그만 보기 — "물었다"도 함께 적는다 */
  @Post('mute')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async mute(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ muted_until: string }> {
    const { mutedUntil } = await this.contentReviewService.mutePrompt(
      currentUser.id,
      new Date(),
    );

    return { muted_until: mutedUntil };
  }
}
