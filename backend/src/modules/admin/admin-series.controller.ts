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
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { tmpdir } from 'node:os';
import { diskStorage } from 'multer';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import {
  ContentLengthProfile,
  SeriesStatus,
} from '@/modules/content/content.enum';

import {
  AdminSeriesItemDto,
  AdminSeriesListResponseDto,
} from './dto/admin-series-item.dto';
import {
  CreateSeriesRequestDto,
  normalizePublisherName,
} from './dto/create-series-request.dto';
import { UpdateSeriesRequestDto } from './dto/update-series-request.dto';
import {
  AdminSeriesService,
  SERIES_COVER_FIELD,
} from './services/admin-series.service';
import {
  removeUploadedFiles,
  UploadCleanupInterceptor,
} from './upload-cleanup.interceptor';
import { MAX_SERIES_COVER_RECEIVE_BYTES } from './admin.constant';

interface CoverFiles {
  cover?: Express.Multer.File[];
}

/**
 * 표지 multipart(KAN-234) — 콘텐츠 업로드와 같이 **디스크 임시 파일**로 받고, 성공·서비스 실패는 핸들러의 `finally`가,
 * 파이프 실패(uuid 400 등)는 `UploadCleanupInterceptor`가 지운다. 본문 파서는 건드리지 않는다 — 경로별 `express.json()`이
 * 전역 파서 등록을 끈 2026-10-07 장애 뒤로 멀티파트는 이 인터셉터 패턴으로만 받는다.
 *
 * multer 상한(`MAX_SERIES_COVER_RECEIVE_BYTES`, 20MB)은 서버 보호용이다. 표지 상한(5MB)은 그 안에서 서비스가 400
 * (`details.field = "cover"`)으로 거절한다 — multer 상한에 걸리면 필드 표기 없는 413이라, 콘텐츠 `thumbnail`과 같은
 * 400을 주려면 상한을 그보다 넉넉히 둬야 한다. 다른 파일 필드는 multer가 400으로 막는다(`Unexpected field`).
 */
const COVER_FILE_FIELDS = [{ name: SERIES_COVER_FIELD, maxCount: 1 }];
const COVER_MULTER_OPTIONS = {
  storage: diskStorage({ destination: tmpdir() }),
  limits: { fileSize: MAX_SERIES_COVER_RECEIVE_BYTES, files: 1 },
};

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
        publisherName: normalizePublisherName(request.publisher_name ?? null),
        lengthProfile: request.length_profile ?? ContentLengthProfile.STANDARD,
        variantOfSeriesId: request.variant_of_series_id ?? null,
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
      request.status === undefined &&
      request.publisher_name === undefined
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
        publisherName:
          request.publisher_name === undefined
            ? undefined
            : normalizePublisherName(request.publisher_name),
      }),
    );
  }

  /**
   * 표지 올리기·교체(KAN-234) — multipart/form-data, 파일 필드 `cover` 하나. 검증·저장 규격은 콘텐츠 `thumbnail`과 같다
   * (jpg/jpeg/png/webp ≤5MB → WebP 768px). 응답은 `AdminSeriesItem`(`cover_url`이 새 URL).
   *
   * **별도 경로로 둔 이유**: `POST`·`PATCH /admin/series`는 JSON이고 파이프라인(`pipeline/apps/web/lib/ear.ts`)이 이미 그렇게
   * 부른다. 그 둘을 multipart로 바꾸면 배포된 파이프라인이 깨진다. 같은 파일을 다시 올려도 결과가 같아 `PUT`이다.
   */
  @Put(':seriesId/cover')
  @UseInterceptors(
    FileFieldsInterceptor(COVER_FILE_FIELDS, COVER_MULTER_OPTIONS),
    // 파이프(400)에서 던져도 임시 파일을 지운다 — 핸들러의 finally 는 파이프 실패에 닿지 않는다
    UploadCleanupInterceptor,
  )
  async replaceCover(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @UploadedFiles() files: CoverFiles | undefined,
  ): Promise<AdminSeriesItemDto> {
    try {
      const cover = files?.cover?.[0];
      if (!cover) {
        throw new BusinessException({
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.VALIDATION_FAILED,
          message: '표지 이미지가 필요해요',
          details: { field: SERIES_COVER_FIELD },
        });
      }

      return AdminSeriesItemDto.from(
        await this.adminSeriesService.replaceCover(currentUser.id, seriesId, {
          path: cover.path,
          originalName: cover.originalname,
          mimeType: cover.mimetype,
          size: cover.size,
        }),
      );
    } finally {
      await removeUploadedFiles(files);
    }
  }
}
