import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ExternalServiceException } from '@/common/exceptions/external-service.exception';
import { ContentOrigin } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { TopicService } from '@/modules/interest/services/topic.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import {
  AdminContentListQuery,
  AdminContentPage,
  AdminContentView,
  UploadContentCommand,
  UploadedFileInput,
} from '../admin.types';
import {
  AUDIO_CONTENT_TYPES,
  AUDIT_ACTION_CONTENT_UPLOAD,
  MAX_AUDIO_FILE_BYTES,
  MAX_THUMBNAIL_FILE_BYTES,
  THUMBNAIL_CONTENT_TYPES,
} from '../admin.constant';
import { AudioProbe } from '../audio-probe';
import { ContentStorageClient } from '../content-storage.client';

/**
 * admin.md 4.2 — 업로드 → 즉시 발행.
 *
 * ```
 * [검증] 필수값·파일 형식·라이선스 기간·주제 유효성·검수 확인
 *    ↓
 * [저장] 오디오·썸네일을 저장소에 올린다 → audio_path 확보
 *    ↓
 * [발행] 트랜잭션: contents(published) + content_topics + content_sources + audit_logs.
 *        어느 하나라도 실패하면 전부 롤백하고 올린 파일을 지운다
 * ```
 *
 * 저장소를 트랜잭션 **밖에서 먼저** 올리는 이유: 업로드는 수십 초가 걸릴 수 있어 그동안
 * DB 트랜잭션을 잡고 있을 이유가 없고, 실패 시 정리해야 할 것이 파일이지 행이 아니다.
 */
@Injectable()
export class AdminContentService {
  private readonly logger = new Logger(AdminContentService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly contentService: ContentService,
    private readonly topicService: TopicService,
    private readonly auditLogService: AuditLogService,
    private readonly storage: ContentStorageClient,
    private readonly audioProbe: AudioProbe,
  ) {}

  async upload(
    command: UploadContentCommand,
    now: Date,
  ): Promise<AdminContentView> {
    this.validateDisclosure(command, now);
    const audioExtension = this.resolveExtension(
      command.audio,
      AUDIO_CONTENT_TYPES,
      MAX_AUDIO_FILE_BYTES,
      'audio',
    );
    const thumbnailExtension = this.resolveExtension(
      command.thumbnail,
      THUMBNAIL_CONTENT_TYPES,
      MAX_THUMBNAIL_FILE_BYTES,
      'thumbnail',
    );

    const topics = await this.topicService.findAllByIds(command.topicIds);
    if (topics.length !== new Set(command.topicIds).size) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.ADMIN_TOPIC_NOT_FOUND,
        message: '존재하지 않는 주제가 있어요',
        details: { field: 'topic_ids' },
      });
    }

    const durationSec = await this.audioProbe.readDurationSec(command.audio);
    if (durationSec === null) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.ADMIN_AUDIO_UNREADABLE,
        message: '오디오 길이를 읽을 수 없어요. 파일을 확인해 주세요',
        details: { field: 'audio' },
      });
    }

    const uploadedKeys: string[] = [];
    let audioPath: string;
    let thumbnailUrl: string;
    try {
      audioPath = await this.storage.putAudio(command.audio, audioExtension);
      uploadedKeys.push(audioPath);
      const thumbnail = await this.storage.putThumbnail(
        command.thumbnail,
        thumbnailExtension,
      );
      uploadedKeys.push(thumbnail.key);
      thumbnailUrl = thumbnail.url ?? '';
    } catch (error) {
      await this.storage.remove(uploadedKeys);
      this.logger.error('content upload to storage failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalServiceException({
        errorCode: ErrorCode.ADMIN_STORAGE_FAILED,
        message: '파일 저장에 실패했어요. 다시 시도해 주세요',
        retryable: true,
      });
    }

    let content: Content;
    try {
      content = await this.dataSource.transaction(async (manager) => {
        const published = await this.contentService.publish(
          {
            title: command.title,
            description: command.description,
            origin: command.origin,
            authorName: command.authorName,
            sourceName: command.sourceName,
            sourceUrl: command.sourceUrl,
            partnerId: command.partnerId,
            licenseExpiresAt: command.licenseExpiresAt,
            seriesId: command.seriesId,
            episodeNo: command.episodeNo,
            totalEpisodes: command.totalEpisodes,
            audioPath,
            durationSec,
            thumbnailUrl,
            topicIds: [...new Set(command.topicIds)],
            sources:
              command.origin === ContentOrigin.AI_GENERATED
                ? command.sources
                : [],
          },
          now,
          manager,
        );

        // 검수 확인 입력값을 `after`에 남긴다 — 이행 증적은 이 기록이다(domain.md 5.1)
        await this.auditLogService.record(
          {
            actor: command.actorUserId,
            action: AUDIT_ACTION_CONTENT_UPLOAD,
            target: `content:${published.id}`,
            after: {
              title: command.title,
              origin: command.origin,
              topic_ids: command.topicIds,
              source_name: command.sourceName,
              review_confirmed: command.reviewConfirmed,
              duration_sec: durationSec,
            },
          },
          manager,
        );

        return published;
      });
    } catch (error) {
      await this.storage.remove(uploadedKeys);
      throw error;
    }

    this.logger.log('content published', {
      content_id: content.id,
      actor: command.actorUserId,
    });

    return {
      content,
      topics: topics.map((topic) => ({ topicId: topic.id, name: topic.name })),
    };
  }

  async findPage(query: AdminContentListQuery): Promise<AdminContentPage> {
    const { items, total } = await this.contentService.findAdminPage(query);
    const topicViews = await this.contentService.findTopicViews(
      items.map((content) => content.id),
    );

    return {
      items: items.map((content) => ({
        content,
        topics: topicViews
          .filter((view) => view.contentId === content.id)
          .map((view) => ({ topicId: view.topicId, name: view.name })),
      })),
      total,
    };
  }

  /**
   * admin.md 3.1·4.2 — 출처 필드는 `origin`으로 분기한다.
   * partner: author_name·source_url·partner_id·license_expires_at 전부 필수, 만료 전이어야 한다.
   * ai_generated: sources 최소 1개, partner_id는 받지 않는다.
   * 검수 확인 미체크는 어느 origin이든 거부한다(4.2-1).
   */
  private validateDisclosure(command: UploadContentCommand, now: Date): void {
    if (!command.reviewConfirmed) {
      throw this.validationFailed(
        'review_confirmed',
        '검수 완료 확인이 필요해요',
      );
    }

    if (command.seriesId !== null) {
      if (command.episodeNo === null || command.totalEpisodes === null) {
        throw this.validationFailed(
          'episode_no',
          '시리즈에는 편 번호와 총 편수가 필요해요',
        );
      }
      if (command.episodeNo > command.totalEpisodes) {
        throw this.validationFailed(
          'episode_no',
          '편 번호가 총 편수를 넘을 수 없어요',
        );
      }
    }

    if (command.origin === ContentOrigin.PARTNER) {
      if (!command.authorName) {
        throw this.validationFailed(
          'author_name',
          '파트너 콘텐츠는 원저자가 필요해요',
        );
      }
      if (!command.sourceUrl) {
        throw this.validationFailed(
          'source_url',
          '파트너 콘텐츠는 원문 링크가 필요해요',
        );
      }
      if (!command.partnerId) {
        throw this.validationFailed(
          'partner_id',
          '파트너 콘텐츠는 파트너가 필요해요',
        );
      }
      if (!command.licenseExpiresAt) {
        throw this.validationFailed(
          'license_expires_at',
          '파트너 콘텐츠는 라이선스 만료일이 필요해요',
        );
      }
      if (command.licenseExpiresAt.getTime() <= now.getTime()) {
        throw new BusinessException({
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.ADMIN_LICENSE_EXPIRED,
          message: '라이선스 기간이 지난 콘텐츠는 올릴 수 없어요',
          details: { field: 'license_expires_at' },
        });
      }
      return;
    }

    if (command.partnerId !== null) {
      throw this.validationFailed(
        'partner_id',
        'AI 생성 콘텐츠에는 파트너를 지정하지 않아요',
      );
    }
    if (command.sources.length === 0) {
      throw this.validationFailed(
        'sources',
        'AI 생성 콘텐츠는 참고 소스가 1개 이상 필요해요',
      );
    }
  }

  private resolveExtension(
    file: UploadedFileInput,
    allowed: Readonly<Record<string, string>>,
    maxBytes: number,
    field: string,
  ): string {
    const extension = file.originalName.split('.').pop()?.toLowerCase() ?? '';

    if (!(extension in allowed)) {
      throw this.validationFailed(
        field,
        `허용되지 않는 파일 형식이에요 (${Object.keys(allowed).join(', ')})`,
      );
    }
    if (file.size > maxBytes) {
      throw this.validationFailed(
        field,
        `파일이 너무 커요 (최대 ${Math.floor(maxBytes / 1024 / 1024)}MB)`,
      );
    }

    return extension;
  }

  /** admin.md 5장 — 검증 실패는 필드별 인라인 에러로 보여야 하므로 `field`를 싣는다 */
  private validationFailed(field: string, message: string): BusinessException {
    return new BusinessException({
      status: HttpStatus.BAD_REQUEST,
      errorCode: ErrorCode.VALIDATION_FAILED,
      message,
      details: { field },
    });
  }
}
