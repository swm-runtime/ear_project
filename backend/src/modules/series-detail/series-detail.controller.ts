import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ContentCohortService } from '@/modules/content/services/content-cohort.service';
import { toUserMarket } from '@/modules/user/policies/market.policy';

import { GetPublisherSeriesResponseDto } from './dto/get-publisher-series-response.dto';
import { GetSeriesDetailResponseDto } from './dto/get-series-detail-response.dto';
import { RestoreSeriesRequestDto } from './dto/restore-series-request.dto';
import { SaveSeriesRequestDto } from './dto/save-series-request.dto';
import { UnsaveSeriesQueryRequestDto } from './dto/unsave-series-query-request.dto';
import {
  RestoreSeriesResponseDto,
  SaveSeriesResponseDto,
  UnsaveSeriesResponseDto,
} from './dto/series-save-response.dto';
import { SeriesDetailOrchestrator } from './series-detail.orchestrator';

/**
 * 시리즈 화면(KAN-134 확정 설계 3번). uuid가 아닌 세그먼트는 `ParseUUIDPipe`가 `VALIDATION_FAILED`(400)로 거른다.
 * 없는 시리즈·다른 시장 시리즈·노출 중인 편이 없는 시리즈는 모두 404 `NOT_FOUND`다.
 *
 * 시리즈째 담기·빼기·복구(KAN-245)도 여기 둔다 — 편 담기가 `/contents/:id/save`에 있는 것과 같은 논리로, 시리즈 화면이
 * 아는 것은 `series_id`뿐이다. **담기와 빼기를 토글로 합치지 않고**, `Idempotency-Key` 대신 `client_seq`를 되돌리는 것도
 * 편 담기(`ContentSaveController`)와 같다 — 빼기는 본문 없는 DELETE라 순번을 쿼리로 받는다.
 */
@Controller('series')
@UseGuards(JwtAuthGuard)
export class SeriesDetailController {
  constructor(
    private readonly seriesDetailOrchestrator: SeriesDetailOrchestrator,
    private readonly contentCohortService: ContentCohortService,
  ) {}

  @Get(':seriesId')
  async getSeries(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
  ): Promise<GetSeriesDetailResponseDto> {
    return GetSeriesDetailResponseDto.from(
      await this.seriesDetailOrchestrator.getSeries(
        currentUser.id,
        seriesId,
        new Date(),
        toUserMarket(currentUser.market),
      ),
    );
  }

  /**
   * 같은 간행물(발행 이름)의 다른 시리즈 — 시리즈 화면 아래 "○○의 다른 시리즈" 줄(2026-10-22 PM). 기준 시리즈가 안 보이면 404,
   * 발행 이름이 없으면 빈 목록
   */
  @Get(':seriesId/publisher-series')
  async getPublisherSeries(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
  ): Promise<GetPublisherSeriesResponseDto> {
    return GetPublisherSeriesResponseDto.from(
      await this.seriesDetailOrchestrator.getPublisherSeries(
        seriesId,
        new Date(),
        toUserMarket(currentUser.market),
        // 다른 시리즈 목록은 노출면이다 — 짧은 판 코호트로 거른다(KAN-298). 기준 시리즈 화면 자체는 막지 않는다
        this.contentCohortService.resolve(
          currentUser.signedUpAt,
          toUserMarket(currentUser.market),
        ),
      ),
    );
  }

  /** 새로 담긴 편이 있든 없든 200이다 — 시리즈째 담기 기록은 upsert라 "새로 생겼다"를 가를 소비자가 없다 */
  @Post(':seriesId/save')
  @HttpCode(HttpStatus.OK)
  async saveSeries(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @Body() request: SaveSeriesRequestDto,
  ): Promise<SaveSeriesResponseDto> {
    return SaveSeriesResponseDto.from(
      await this.seriesDetailOrchestrator.saveSeries(
        currentUser.id,
        seriesId,
        new Date(),
        toUserMarket(currentUser.market),
      ),
      request.client_seq,
    );
  }

  /** 뺄 것이 없어도 200 — 오프라인 큐 재전송(`common-error-handling.md` 4.5). 순번을 되돌려야 해서 204가 아니다 */
  @Delete(':seriesId/save')
  @HttpCode(HttpStatus.OK)
  async unsaveSeries(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @Query() query: UnsaveSeriesQueryRequestDto,
  ): Promise<UnsaveSeriesResponseDto> {
    return UnsaveSeriesResponseDto.from(
      await this.seriesDetailOrchestrator.unsaveSeries(
        currentUser.id,
        seriesId,
        new Date(),
      ),
      query.client_seq,
    );
  }

  @Post(':seriesId/restore')
  @HttpCode(HttpStatus.OK)
  async restoreSeries(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @Body() request: RestoreSeriesRequestDto,
  ): Promise<RestoreSeriesResponseDto> {
    return RestoreSeriesResponseDto.from(
      await this.seriesDetailOrchestrator.restoreSeries(
        currentUser.id,
        seriesId,
        request.item_ids,
        new Date(),
      ),
    );
  }
}
