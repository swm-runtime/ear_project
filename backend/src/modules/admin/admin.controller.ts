import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

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
import { diskStorage } from 'multer';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { UploadedFileInput } from './admin.types';
import {
  MAX_AUDIO_FILE_BYTES,
  MAX_ENRICHMENT_FILE_BYTES,
  MAX_THUMBNAIL_FILE_BYTES,
} from './admin.constant';
import { AdminContentListResponseDto } from './dto/admin-content-list-response.dto';
import { AdminContentQueryRequestDto } from './dto/admin-content-query-request.dto';
import { AdminContentItemDto } from './dto/admin-content-item.dto';
import {
  AdminTopicItemDto,
  AdminTopicListResponseDto,
} from './dto/admin-topic-item.dto';
import { CreateTopicRequestDto } from './dto/create-topic-request.dto';
import {
  RepublishContentFormRequestDto,
  RepublishContentRequestDto,
} from './dto/republish-content-request.dto';
import { WithdrawContentRequestDto } from './dto/withdraw-content-request.dto';
import { UpdateTopicRequestDto } from './dto/update-topic-request.dto';
import {
  UploadContentFormRequestDto,
  UploadContentRequestDto,
} from './dto/upload-content-request.dto';
import { AdminSystemStatsResponseDto } from './dto/admin-system-stats-response.dto';
import { AdminContentService } from './services/admin-content.service';
import { AdminSystemStatsService } from './services/admin-system-stats.service';
import { ResourceAlertService } from './services/resource-alert.service';
import { AdminTopicService } from './services/admin-topic.service';

interface UploadFiles {
  audio?: Express.Multer.File[];
  thumbnail?: Express.Multer.File[];
  enrichment_file?: Express.Multer.File[];
}

/**
 * 업로드 파일은 **디스크 임시 파일**로 받는다(multer 기본은 메모리). 오디오 200MB를 램에
 * 통째로 올리면 길이 추출·S3 전송이 동시에 보유해 요청당 수백 MB가 되고, 단일 EC2(4GB)에서
 * 동시 2건이면 자원 알림이 울린다. 임시 파일은 요청이 어떻게 끝나든 `discardUploads`가 지운다.
 *
 * `fileSize`는 필드별로 줄 수 없어(multer 한계) 최대값(오디오)으로 두고, 필드별 상한은
 * 파일이 도착한 직후 `assertFileSizes`가 서비스 진입 전에 검사한다.
 */
const UPLOAD_FILE_FIELDS = [
  { name: 'audio', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
  { name: 'enrichment_file', maxCount: 1 },
];
const UPLOAD_MULTER_OPTIONS = {
  storage: diskStorage({ destination: tmpdir() }),
  limits: { fileSize: MAX_AUDIO_FILE_BYTES, files: 3 },
};
const FILE_FIELD_MAX_BYTES: Record<string, number> = {
  audio: MAX_AUDIO_FILE_BYTES,
  thumbnail: MAX_THUMBNAIL_FILE_BYTES,
  enrichment_file: MAX_ENRICHMENT_FILE_BYTES,
};

/**
 * admin.md — 관리자 API. **모든 라우트가 `role == 'admin'`을 서버에서 검증한다**(4.1).
 * 일반 계정은 403이다 — 진입점이 숨겨져 있는 것과 무관하게.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminController {
  constructor(
    private readonly adminContentService: AdminContentService,
    private readonly adminSystemStatsService: AdminSystemStatsService,
    private readonly adminTopicService: AdminTopicService,
    private readonly resourceAlertService: ResourceAlertService,
  ) {}

  /** 자원·DB 부하 스냅샷 — 로그 콘솔 서버 상태 탭 (읽기 전용, 부작용 없음) */
  @Get('system-stats')
  async getSystemStats(): Promise<AdminSystemStatsResponseDto> {
    return AdminSystemStatsResponseDto.from(
      await this.adminSystemStatsService.snapshot(new Date()),
      this.resourceAlertService.history(),
    );
  }

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

  /** admin.md 4.4 — 회수. 노출면 반영은 partner-control.md 4.3을 따른다 */
  @Post('contents/:contentId/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdrawContent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() request: WithdrawContentRequestDto,
  ): Promise<AdminContentItemDto> {
    return AdminContentItemDto.from(
      await this.adminContentService.withdraw(
        currentUser.id,
        contentId,
        request.reason ?? null,
        new Date(),
      ),
    );
  }

  /**
   * admin.md 4.4 — **저장소 파일 회수.** 회수 상태에서만 허용하며 되돌릴 수 없다.
   *
   * **행은 남긴다.** `play_records`가 파트너 정산의 원본 근거라(FR-34), 행을 지우면
   * 그 수치를 되짚을 수 없다. 노출은 회수가 이미 막고 있으므로 사용자 차이는 없고,
   * 이 경로가 해결하는 것은 **저장소 비용**이다.
   */
  @Delete('contents/:contentId/storage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async purgeContentStorage(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<void> {
    await this.adminContentService.purgeStorage(currentUser.id, contentId);
  }

  /** 회수 복구 — 삭제된 library_items는 되살리지 않는다 */
  @Post('contents/:contentId/restore')
  @HttpCode(HttpStatus.OK)
  async restoreContent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<AdminContentItemDto> {
    return AdminContentItemDto.from(
      await this.adminContentService.restore(currentUser.id, contentId),
    );
  }

  /**
   * multipart/form-data — `audio` · `thumbnail` 파일 + `payload`(JSON 문자열).
   * 메타를 JSON 한 덩어리로 받는 이유: multipart 텍스트 필드는 전부 문자열이라 배열·중첩
   * (`topic_ids[]` · `sources[]`)을 DTO 검증에 태우기 어렵다.
   */
  @Post('contents')
  @UseInterceptors(
    FileFieldsInterceptor(UPLOAD_FILE_FIELDS, UPLOAD_MULTER_OPTIONS),
  )
  async uploadContent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() form: UploadContentFormRequestDto,
    @UploadedFiles() files: UploadFiles,
  ): Promise<AdminContentItemDto> {
    try {
      return await this.handleUpload(currentUser, form, files);
    } finally {
      await discardUploads(files);
    }
  }

  private async handleUpload(
    currentUser: AuthenticatedUser,
    form: UploadContentFormRequestDto,
    files: UploadFiles,
  ): Promise<AdminContentItemDto> {
    this.assertFileSizes(files);
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
        enrichment: files.enrichment_file?.[0]
          ? toFileInput(files.enrichment_file[0])
          : null,
      },
      new Date(),
    );

    return AdminContentItemDto.from(view);
  }

  /**
   * admin-api.md 4.10 — 재발행. 같은 `content_id`에 오디오·메타를 갈아끼우고
   * `content_version`을 올린다. 파이프라인이 TTS 규격을 바꿔 오디오를 재생성했을 때
   * 사용자 라이브러리·재생 기록을 끊지 않고 발행본만 교체하는 경로다.
   *
   * **모든 파트가 선택이다** — 파이프라인은 `audio`만 보낸다.
   */
  @Patch('contents/:contentId')
  @UseInterceptors(
    FileFieldsInterceptor(UPLOAD_FILE_FIELDS, UPLOAD_MULTER_OPTIONS),
  )
  async republishContent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() form: RepublishContentFormRequestDto,
    @UploadedFiles() files: UploadFiles,
  ): Promise<AdminContentItemDto> {
    try {
      return await this.handleRepublish(currentUser, contentId, form, files);
    } finally {
      await discardUploads(files);
    }
  }

  private async handleRepublish(
    currentUser: AuthenticatedUser,
    contentId: string,
    form: RepublishContentFormRequestDto,
    files: UploadFiles,
  ): Promise<AdminContentItemDto> {
    this.assertFileSizes(files);
    const audio = files.audio?.[0];
    const thumbnail = files.thumbnail?.[0];
    const payload = form.payload
      ? await this.parseJson(form.payload, RepublishContentRequestDto)
      : null;

    const view = await this.adminContentService.republish({
      actorUserId: currentUser.id,
      contentId,
      title: payload?.title,
      description: payload?.description,
      sourceName: payload?.source_name,
      topicIds: payload?.topic_ids,
      // 넘어온 키만 바꾸므로 `undefined`를 유지한다 — 빈 배열은 "출처를 지운다"는 뜻이다
      sources: payload?.sources?.map((source) => ({
        title: source.title,
        author: source.author ?? null,
        url: source.url ?? null,
      })),
      audio: audio ? toFileInput(audio) : null,
      thumbnail: thumbnail ? toFileInput(thumbnail) : null,
      enrichment: files.enrichment_file?.[0]
        ? toFileInput(files.enrichment_file[0])
        : null,
    });

    return AdminContentItemDto.from(view);
  }

  /** 전역 ValidationPipe와 같은 옵션으로 JSON payload를 검증한다(architecture.md 9.3) */
  private async parsePayload(raw: string): Promise<UploadContentRequestDto> {
    return this.parseJson(raw, UploadContentRequestDto);
  }

  private async parseJson<T extends object>(
    raw: string,
    type: new () => T,
  ): Promise<T> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw this.missingField('payload', 'payload가 올바른 JSON이 아니에요');
    }

    const dto = plainToInstance(type, parsed);
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

  /** 필드별 상한 — 썸네일 5MB·추천 메타 1MB를 200MB까지 받아 준 뒤 서비스에서 거부하면 늦다 */
  private assertFileSizes(files: UploadFiles): void {
    for (const [field, maxBytes] of Object.entries(FILE_FIELD_MAX_BYTES)) {
      const file = files[field as keyof UploadFiles]?.[0];
      if (file && file.size > maxBytes) {
        throw this.missingField(
          field,
          `파일이 너무 커요 (최대 ${Math.floor(maxBytes / 1024 / 1024)}MB)`,
        );
      }
    }
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
    path: file.path,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };
}

/** 임시 파일 정리 — 성공·실패 어느 경로든 `/tmp`에 남기지 않는다. 없는 파일은 무시한다 */
async function discardUploads(files: UploadFiles | undefined): Promise<void> {
  const uploaded: Express.Multer.File[] = [
    ...(files?.audio ?? []),
    ...(files?.thumbnail ?? []),
    ...(files?.enrichment_file ?? []),
  ];
  const paths = uploaded
    .map((file) => file.path)
    .filter((path): path is string => typeof path === 'string');

  await Promise.all(paths.map((path) => rm(path, { force: true })));
}
