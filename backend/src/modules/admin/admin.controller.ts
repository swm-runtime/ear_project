import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { UploadedFileInput } from './admin.types';
import { MAX_AUDIO_FILE_BYTES } from './admin.constant';
import { AdminContentListResponseDto } from './dto/admin-content-list-response.dto';
import { AdminContentQueryRequestDto } from './dto/admin-content-query-request.dto';
import { AdminContentItemDto } from './dto/admin-content-item.dto';
import {
  AdminTopicItemDto,
  AdminTopicListResponseDto,
} from './dto/admin-topic-item.dto';
import { CreateTopicRequestDto } from './dto/create-topic-request.dto';
import { UpdateTopicRequestDto } from './dto/update-topic-request.dto';
import {
  UploadContentFormRequestDto,
  UploadContentRequestDto,
} from './dto/upload-content-request.dto';
import { AdminContentService } from './services/admin-content.service';
import { AdminTopicService } from './services/admin-topic.service';

interface UploadFiles {
  audio?: Express.Multer.File[];
  thumbnail?: Express.Multer.File[];
}

/**
 * admin.md — 관리자 API. **모든 라우트가 `role == 'admin'`을 서버에서 검증한다**(4.1).
 * 일반 계정은 403이다 — 진입점이 숨겨져 있는 것과 무관하게.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminController {
  constructor(
    private readonly adminContentService: AdminContentService,
    private readonly adminTopicService: AdminTopicService,
  ) {}

  @Get('topics')
  async listTopics(): Promise<AdminTopicListResponseDto> {
    return AdminTopicListResponseDto.from(
      await this.adminTopicService.findAll(),
    );
  }

  @Post('topics')
  async createTopic(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: CreateTopicRequestDto,
  ): Promise<AdminTopicItemDto> {
    return AdminTopicItemDto.from(
      await this.adminTopicService.create(currentUser.id, {
        name: request.name,
        parentCategory: request.parent_category,
        displayOrder: request.display_order ?? null,
      }),
    );
  }

  @Patch('topics/:topicId')
  async updateTopic(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() request: UpdateTopicRequestDto,
  ): Promise<AdminTopicItemDto> {
    return AdminTopicItemDto.from(
      await this.adminTopicService.update(currentUser.id, topicId, {
        name: request.name,
        parentCategory: request.parent_category,
        isVisible: request.is_visible,
        displayOrder: request.display_order,
      }),
    );
  }

  @Delete('topics/:topicId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTopic(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('topicId', ParseUUIDPipe) topicId: string,
  ): Promise<void> {
    await this.adminTopicService.remove(currentUser.id, topicId);
  }

  @Get('contents')
  async listContents(
    @Query() query: AdminContentQueryRequestDto,
  ): Promise<AdminContentListResponseDto> {
    return AdminContentListResponseDto.from(
      await this.adminContentService.findPage({
        status: query.status,
        offset: query.offset ?? 0,
        limit: query.limit ?? 20,
      }),
    );
  }

  /**
   * multipart/form-data — `audio` · `thumbnail` 파일 + `payload`(JSON 문자열).
   * 메타를 JSON 한 덩어리로 받는 이유: multipart 텍스트 필드는 전부 문자열이라 배열·중첩
   * (`topic_ids[]` · `sources[]`)을 DTO 검증에 태우기 어렵다.
   */
  @Post('contents')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audio', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_AUDIO_FILE_BYTES, files: 2 } },
    ),
  )
  async uploadContent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() form: UploadContentFormRequestDto,
    @UploadedFiles() files: UploadFiles,
  ): Promise<AdminContentItemDto> {
    const audio = files.audio?.[0];
    const thumbnail = files.thumbnail?.[0];
    if (!audio) {
      throw this.missingField('audio', '오디오 파일이 필요해요');
    }
    if (!thumbnail) {
      throw this.missingField('thumbnail', '썸네일 이미지가 필요해요');
    }

    const payload = await this.parsePayload(form.payload);

    const view = await this.adminContentService.upload(
      {
        actorUserId: currentUser.id,
        title: payload.title,
        description: payload.description,
        origin: payload.origin,
        authorName: payload.author_name ?? null,
        sourceName: payload.source_name,
        sourceUrl: payload.source_url ?? null,
        partnerId: payload.partner_id ?? null,
        licenseExpiresAt: payload.license_expires_at
          ? new Date(payload.license_expires_at)
          : null,
        seriesId: payload.series_id ?? null,
        episodeNo: payload.episode_no ?? null,
        totalEpisodes: payload.total_episodes ?? null,
        topicIds: payload.topic_ids,
        sources: (payload.sources ?? []).map((source) => ({
          title: source.title,
          author: source.author ?? null,
          url: source.url ?? null,
        })),
        reviewConfirmed: payload.review_confirmed,
        audio: toFileInput(audio),
        thumbnail: toFileInput(thumbnail),
      },
      new Date(),
    );

    return AdminContentItemDto.from(view);
  }

  /** 전역 ValidationPipe와 같은 옵션으로 JSON payload를 검증한다(architecture.md 9.3) */
  private async parsePayload(raw: string): Promise<UploadContentRequestDto> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw this.missingField('payload', 'payload가 올바른 JSON이 아니에요');
    }

    const dto = plainToInstance(UploadContentRequestDto, parsed);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      // admin.md 5장 — 어느 필드가 왜 막혔는지 인라인으로 보여야 하므로 첫 위반 필드를 싣는다
      const first = errors[0];
      throw this.missingField(
        first.property,
        Object.values(first.constraints ?? {})[0] ??
          `${first.property} 값이 올바르지 않아요`,
      );
    }

    return dto;
  }

  private missingField(field: string, message: string): BusinessException {
    return new BusinessException({
      status: HttpStatus.BAD_REQUEST,
      errorCode: ErrorCode.VALIDATION_FAILED,
      message,
      details: { field },
    });
  }
}

function toFileInput(file: Express.Multer.File): UploadedFileInput {
  return {
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };
}
