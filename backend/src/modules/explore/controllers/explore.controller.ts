import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { ExploreContentListResponseDto } from '../dto/explore-content-list-response.dto';
import { ExploreContentQueryRequestDto } from '../dto/explore-content-query-request.dto';
import { ExplorePopularListResponseDto } from '../dto/explore-popular-list-response.dto';
import { ExplorePopularQueryRequestDto } from '../dto/explore-popular-query-request.dto';
import { ExploreSearchQueryRequestDto } from '../dto/explore-search-query-request.dto';
import { ExploreSearchResponseDto } from '../dto/explore-search-response.dto';
import { ExploreTopicListResponseDto } from '../dto/explore-topic-list-response.dto';
import { GetExploreFeedResponseDto } from '../dto/get-explore-feed-response.dto';
import {
  DEFAULT_EXPLORE_PAGE_SIZE,
  DEFAULT_POPULAR_PERIOD,
} from '../explore.constant';
import { ExploreOrchestrator } from '../explore.orchestrator';

/**
 * explore-api.md 3장 — 탐색 화면의 조회 엔드포인트.
 *
 * **피드(1)와 필터 목록(2)을 한 엔드포인트로 합치지 않는다.** 두 모드는 응답의 모양 자체가
 * 다르다 — 피드는 섹션 배열이고 필터 목록은 커서 페이지네이션 목록이다. 쿼리 파라미터로
 * 모양이 바뀌는 응답은 클라이언트 타입이 유니언이 되고, 커서 규칙도 섹션 모드와 섞여 흐려진다.
 *
 * 검색(`GET /explore/search`)은 **MVP 포함이다**(합의 2026-08-23 — 종전 "P1 유지·검색창
 * 비활성" 합의 2026-08-06을 폐기).
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

  /**
   * 인기 콘텐츠의 구간 토글이 호출한다. **피드는 다시 부르지 않는다** — 구간만 바뀌었는데
   * 관심사 섹션의 소비 신호 랭킹까지 재계산될 이유가 없다(`explore.md` 4.1-1).
   */
  @Get('popular')
  async getPopular(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ExplorePopularQueryRequestDto,
  ): Promise<ExplorePopularListResponseDto> {
    return ExplorePopularListResponseDto.from(
      await this.exploreOrchestrator.getPopular(
        currentUser.id,
        {
          // 기본 구간은 서버가 정한다 — 클라이언트에 상수로 두면 서버가 바꿀 때 어긋난다
          period: query.period ?? DEFAULT_POPULAR_PERIOD,
          cursor: query.cursor ?? null,
          limit: query.limit ?? DEFAULT_EXPLORE_PAGE_SIZE,
        },
        new Date(),
      ),
    );
  }

  /** 파라미터가 없다 — 정렬까지 서버가 정해 내려준다(`explore.md` 4.2) */
  @Get('topics')
  async getTopics(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ExploreTopicListResponseDto> {
    return ExploreTopicListResponseDto.from(
      await this.exploreOrchestrator.getTopicChips(currentUser.id),
    );
  }

  /**
   * 키워드 검색(explore-api.md 4.5). 300ms 디바운스·[검색] 제출·추천 키워드 탭이 전부
   * 이 하나를 호출한다. **잔여 재생 표시값을 싣지 않는다** — 검색 화면은 표시를 숨긴다.
   */
  @Get('search')
  async search(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ExploreSearchQueryRequestDto,
  ): Promise<ExploreSearchResponseDto> {
    return ExploreSearchResponseDto.from(
      await this.exploreOrchestrator.search(
        currentUser.id,
        {
          query: query.query,
          topicIds: query.topic_ids ?? [],
          cursor: query.cursor ?? null,
          limit: query.limit ?? DEFAULT_EXPLORE_PAGE_SIZE,
        },
        new Date(),
      ),
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
