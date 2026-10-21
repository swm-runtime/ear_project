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

import { RelatedContentListResponseDto } from '../dto/related-content-list-response.dto';
import { RelatedContentQueryRequestDto } from '../dto/related-content-query-request.dto';
import { DEFAULT_RELATED_CONTENT_LIMIT } from '../explore.constant';
import { ExploreOrchestrator } from '../explore.orchestrator';
import { toUserMarket } from '@/modules/user/policies/market.policy';

/**
 * player-api.md 4.8 — 플레이어 재생 목록 패널의 "다음에 들어볼 만한" 블록(탐색 맥락, `player.md` 4.2-2 · KAN-240).
 *
 * 경로는 플레이어 계약이지만 **explore 모듈에 둔다** — 응답 행이 탐색 콘텐츠 행(explore-api.md 4.1)과 같고, 그 조립
 * (라이브러리 상태·오늘 카운트)이 `ExploreOrchestrator`에 있다. `content` 모듈은 `library`·`playback`을 의존할 수 없다
 * (반대 방향이 이미 있다 — architecture.md 4.5). 코사인 조회 자체는 `ContentService`가 한다.
 *
 * Controller는 try/catch 하지 않는다. 전역 Exception Filter가 변환한다(architecture.md 7.3).
 */
@Controller('contents')
@UseGuards(JwtAuthGuard)
export class ContentRelatedController {
  constructor(private readonly exploreOrchestrator: ExploreOrchestrator) {}

  @Get(':contentId/related')
  async getRelated(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Query() query: RelatedContentQueryRequestDto,
  ): Promise<RelatedContentListResponseDto> {
    return RelatedContentListResponseDto.from(
      await this.exploreOrchestrator.getRelated(currentUser.id, {
        baseContentId: contentId,
        market: toUserMarket(currentUser.market),
        excludeIds: query.exclude_ids ?? [],
        // 기본값은 서버가 정한다 — 클라이언트에 상수로 두면 서버가 바꿀 때 어긋난다
        limit: query.limit ?? DEFAULT_RELATED_CONTENT_LIMIT,
        now: new Date(),
      }),
    );
  }
}
