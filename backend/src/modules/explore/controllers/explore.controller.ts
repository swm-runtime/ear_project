import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { ExploreContentListResponseDto } from '../dto/explore-content-list-response.dto';
import { ExploreContentQueryRequestDto } from '../dto/explore-content-query-request.dto';
import { GetExploreFeedResponseDto } from '../dto/get-explore-feed-response.dto';
import { DEFAULT_EXPLORE_PAGE_SIZE } from '../explore.constant';
import { ExploreOrchestrator } from '../explore.orchestrator';

/**
 * explore-api.md 3장 — 탐색 화면의 조회 엔드포인트.
 *
 * **피드(1)와 필터 목록(2)을 한 엔드포인트로 합치지 않는다.** 두 모드는 응답의 모양 자체가
 * 다르다 — 피드는 섹션 배열이고 필터 목록은 커서 페이지네이션 목록이다. 쿼리 파라미터로
 * 모양이 바뀌는 응답은 클라이언트 타입이 유니언이 되고, 커서 규칙도 섹션 모드와 섞여 흐려진다.
 *
 * 검색(`GET /explore/search`)은 **P1이라 MVP에서 배포하지 않는다**(합의 2026-08-06).
 *
 * Controller는 try/catch 하지 않는다. 전역 Exception Filter가 변환한다(architecture.md 7.3).
 */
@Controller('explore')
@UseGuards(JwtAuthGuard)
export class ExploreController {
  constructor(private readonly exploreOrchestrator: ExploreOrchestrator) {}

  /** 파라미터가 없다 — 주제 필터가 걸리면 아래 `contents`로 전환한다 */
  @Get('feed')
  async getFeed(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<GetExploreFeedResponseDto> {
    return GetExploreFeedResponseDto.from(
      await this.exploreOrchestrator.getFeed(currentUser.id, new Date()),
    );
  }

  @Get('contents')
  async getContents(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ExploreContentQueryRequestDto,
  ): Promise<ExploreContentListResponseDto> {
    return ExploreContentListResponseDto.from(
      await this.exploreOrchestrator.getContents(
        currentUser.id,
        {
          topicIds: query.topic_ids,
          cursor: query.cursor ?? null,
          limit: query.limit ?? DEFAULT_EXPLORE_PAGE_SIZE,
        },
        new Date(),
      ),
    );
  }
}
