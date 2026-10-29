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

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { toUserMarket } from '@/modules/user/policies/market.policy';

import { ContentReviewService } from './content-review.service';
import { ContentReviewPromptResponseDto } from './dto/content-review-prompt-response.dto';
import { ContentReviewSheetResponseDto } from './dto/content-review-sheet-response.dto';
import { SaveContentReviewRequestDto } from './dto/save-content-review-request.dto';
import { SaveContentReviewResponseDto } from './dto/save-content-review-response.dto';

/**
 * content-review-api.md 4.1 · 4.2 — 더보기 시트 [후기] · 콘텐츠 상세 "내 후기".
 *
 * 경로는 `/contents/:contentId/review` — 콘텐츠에 대한 행위가 모이는 계층(`play` · `save`)과 같다. 단건 상세
 * (`GET /contents/:contentId`)와 세그먼트 수가 달라 라우트가 겹치지 않는다. uuid 가 아니면 `ParseUUIDPipe`가 400.
 * **멱등키가 없다** — `(user_id, content_id)` upsert 라 재전송이 같은 상태로 수렴한다(2장).
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

  @Put()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async save(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() request: SaveContentReviewRequestDto,
  ): Promise<SaveContentReviewResponseDto> {
    return SaveContentReviewResponseDto.from(
      await this.contentReviewService.save({
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
