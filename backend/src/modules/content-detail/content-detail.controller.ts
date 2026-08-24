import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { ContentDetailOrchestrator } from './content-detail.orchestrator';
import { GetContentDetailResponseDto } from './dto/get-content-detail-response.dto';

/**
 * content-detail-api.md 3장 — 콘텐츠 단건 상세 조회.
 *
 * 경로는 `/contents/:content_id` — 콘텐츠에 대한 행위·조회가 모이는 계층
 * (`play` · `save` · `audio-urls` 등)의 표준 단건 GET이다. 하위 세그먼트(`/detail` 등)를
 * 붙이지 않는다.
 *
 * uuid가 아닌 세그먼트는 `ParseUUIDPipe`가 `VALIDATION_FAILED`(400)로 거른다.
 * `GET /contents/withdrawn`(회수 동기화 — partner-control 소유, 미구현)을 나중에 만들 때는
 * 그 라우트가 이 파라미터 라우트보다 **먼저 등록**되어야 한다.
 */
@Controller('contents')
@UseGuards(JwtAuthGuard)
export class ContentDetailController {
  constructor(
    private readonly contentDetailOrchestrator: ContentDetailOrchestrator,
  ) {}

  @Get(':contentId')
  async getContentDetail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<GetContentDetailResponseDto> {
    return GetContentDetailResponseDto.from(
      await this.contentDetailOrchestrator.getContentDetail(
        currentUser.id,
        contentId,
        new Date(),
      ),
    );
  }
}
