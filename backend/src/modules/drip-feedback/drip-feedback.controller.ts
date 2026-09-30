import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { DripFeedbackPromptResponseDto } from './dto/drip-feedback-prompt-response.dto';
import { RateDripFeedbackRequestDto } from './dto/rate-drip-feedback-request.dto';
import { DripFeedbackService } from './drip-feedback.service';

/** drip-feedback-api.md 4장 — "어제 추천 어떠셨나요?" */
@Controller('users/me/drip-feedback')
@UseGuards(JwtAuthGuard)
export class DripFeedbackController {
  constructor(private readonly dripFeedbackService: DripFeedbackService) {}

  /** 팝업을 낼지와 묻는 편성분 — 판정은 서버가 한다(4.1). 매번 새로 판정하므로 캐시하지 않는다 */
  @Get('prompt')
  @Header('Cache-Control', 'no-store')
  async prompt(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<DripFeedbackPromptResponseDto> {
    return DripFeedbackPromptResponseDto.from(
      await this.dripFeedbackService.getPrompt(currentUser.id, new Date()),
    );
  }

  /**
   * 별점 저장(4.2). **멱등키를 쓰지 않는다** — `(user_id, content_id)` 유니크 위의 upsert라 같은 요청의 재전송은
   * 같은 상태로 수렴한다(담기와 같은 이유, `explore-api.md` 3장).
   */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async rate(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: RateDripFeedbackRequestDto,
  ): Promise<void> {
    await this.dripFeedbackService.rate({
      userId: currentUser.id,
      ratings: request.ratings.map((rating) => ({
        contentId: rating.content_id,
        stars: rating.stars,
      })),
      now: new Date(),
    });
  }

  /** [이번 주 그만 보기](4.3) — 다음 서비스 주 월요일까지 */
  @Post('mute')
  @HttpCode(HttpStatus.OK)
  async mute(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ muted_until: string }> {
    const { mutedUntil } = await this.dripFeedbackService.mute(
      currentUser.id,
      new Date(),
    );

    return { muted_until: mutedUntil };
  }
}
