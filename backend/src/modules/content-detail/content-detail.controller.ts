import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ContentService } from '@/modules/content/services/content.service';

import { ContentDetailOrchestrator } from './content-detail.orchestrator';
import { GetContentDetailResponseDto } from './dto/get-content-detail-response.dto';
import { GetWithdrawnContentsQueryRequestDto } from './dto/get-withdrawn-contents-query-request.dto';
import { GetWithdrawnContentsResponseDto } from './dto/get-withdrawn-contents-response.dto';

/**
 * content-detail-api.md 3장 — 콘텐츠 단건 상세 조회.
 *
 * 경로는 `/contents/:content_id` — 콘텐츠에 대한 행위·조회가 모이는 계층
 * (`play` · `save` · `audio-urls` 등)의 표준 단건 GET이다. 하위 세그먼트(`/detail` 등)를
 * 붙이지 않는다.
 *
 * uuid가 아닌 세그먼트는 `ParseUUIDPipe`가 `VALIDATION_FAILED`(400)로 거른다.
 * **`GET /contents/withdrawn`(회수 동기화)이 이 컨트롤러에 있는 이유가 그 순서다** —
 * 정적 세그먼트 라우트는 파라미터 라우트보다 먼저 등록돼야 하는데, 다른 모듈에 두면
 * 등록 순서가 모듈 초기화 순서에 묶여 깨지기 쉽다. 같은 컨트롤러 안의 선언 순서는 보장된다.
 */
@Controller('contents')
@UseGuards(JwtAuthGuard)
export class ContentDetailController {
  constructor(
    private readonly contentDetailOrchestrator: ContentDetailOrchestrator,
    private readonly contentService: ContentService,
  ) {}

  /**
   * 회수 동기화(`partner-control.md` 4.3 — 처리 순서 5) — 앱 실행·포그라운드 복귀 시
   * 마지막 동기화 시각 이후 회수된 콘텐츠를 받아 로컬에서 걷어낸다. 재생 중 중단의 주
   * 채널은 위치 저장(4.3) 응답의 `content_status`이고, 이 라우트는 그 보완이다
   * (`tickets/backend/pending/withdrawn-sync-stops-playback.md`).
   */
  @Get('withdrawn')
  async getWithdrawnContents(
    @Query() query: GetWithdrawnContentsQueryRequestDto,
  ): Promise<GetWithdrawnContentsResponseDto> {
    return GetWithdrawnContentsResponseDto.from(
      await this.contentService.findWithdrawnSince(new Date(query.since)),
    );
  }

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
