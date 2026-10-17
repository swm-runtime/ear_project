import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SeriesStatus } from '@/modules/content/content.enum';

import {
  AdminSeriesItemDto,
  AdminSeriesListResponseDto,
} from './dto/admin-series-item.dto';
import { CreateSeriesRequestDto } from './dto/create-series-request.dto';
import { UpdateSeriesRequestDto } from './dto/update-series-request.dto';
import { AdminSeriesService } from './services/admin-series.service';

/**
 * 어드민 — 시리즈 관리(KAN-134 확정 설계 2번, 2026-10-17). 시리즈를 먼저 만들고, 업로드(`POST /admin/contents`)는
 * **존재하는 시리즈의 `series_id`와 `episode_no`만** 보낸다. 기존 콘텐츠를 시리즈로 지정하는 API는 두지 않는다
 * (`admin-api.md` 4.10 — 업로드 뒤 시리즈 필드는 바꾸지 않는다).
 */
@Controller('admin/series')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminSeriesController {
  constructor(private readonly adminSeriesService: AdminSeriesService) {}

  /** 목록 · 편 현황(상태별 편 수와 발행 중 최대 편 번호). 만든 최신순 */
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(): Promise<AdminSeriesListResponseDto> {
    return AdminSeriesListResponseDto.from(
      await this.adminSeriesService.findAll(),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: CreateSeriesRequestDto,
  ): Promise<AdminSeriesItemDto> {
    return AdminSeriesItemDto.from(
      await this.adminSeriesService.create(currentUser.id, {
        title: request.title.trim(),
        description: request.description.trim(),
        totalEpisodes: request.total_episodes,
        status: request.status ?? SeriesStatus.ONGOING,
      }),
    );
  }

  @Patch(':seriesId')
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @Body() request: UpdateSeriesRequestDto,
  ): Promise<AdminSeriesItemDto> {
    // 바꿀 키가 없으면 400 — 변화 없는 `series.update` 감사 기록만 쌓이는 것을 막는다(공지 수정과 같은 규칙)
    if (
      request.title === undefined &&
      request.description === undefined &&
      request.total_episodes === undefined &&
      request.status === undefined
    ) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.VALIDATION_FAILED,
        message: '바꿀 항목이 없어요',
        logLevel: 'warn',
      });
    }

    return AdminSeriesItemDto.from(
      await this.adminSeriesService.update(currentUser.id, seriesId, {
        title: request.title?.trim(),
        description: request.description?.trim(),
        totalEpisodes: request.total_episodes,
        status: request.status,
      }),
    );
  }
}
