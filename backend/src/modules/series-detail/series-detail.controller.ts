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
import { toUserMarket } from '@/modules/user/policies/market.policy';

import { GetSeriesDetailResponseDto } from './dto/get-series-detail-response.dto';
import { SeriesDetailOrchestrator } from './series-detail.orchestrator';

/**
 * 시리즈 화면(KAN-134 확정 설계 3번). uuid가 아닌 세그먼트는 `ParseUUIDPipe`가 `VALIDATION_FAILED`(400)로 거른다.
 * 없는 시리즈·다른 시장 시리즈·노출 중인 편이 없는 시리즈는 모두 404 `NOT_FOUND`다.
 */
@Controller('series')
@UseGuards(JwtAuthGuard)
export class SeriesDetailController {
  constructor(
    private readonly seriesDetailOrchestrator: SeriesDetailOrchestrator,
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
}
