import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ExternalServiceException } from '@/common/exceptions/external-service.exception';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { TopicService } from '@/modules/interest/services/topic.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import {
  AdminContentListQuery,
  AdminContentPage,
  AdminContentView,
  RepublishContentCommand,
  SourceInput,
  UploadContentCommand,
  UploadedFileInput,
} from '../admin.types';
import {
  AUDIO_CONTENT_TYPES,
  AUDIT_ACTION_CONTENT_REPUBLISH,
  AUDIT_ACTION_CONTENT_RESTORE,
  AUDIT_ACTION_CONTENT_UPLOAD,
  AUDIT_ACTION_CONTENT_WITHDRAW,
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
    private readonly libraryService: LibraryService,
    private readonly playbackService: PlaybackService,
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

  /**
   * admin.md 4.3 · admin-api.md 4.10 — 재발행. **같은 행의 오디오·메타를 갈아끼우고
   * `content_version`을 1 올린다.** 회수 후 재업로드와 다른 점은 `content_id`가 유지되는
   * 것이고, 그래서 사용자의 라이브러리·재생 기록이 끊기지 않는다.
   *
   * 흐름은 업로드(`upload`)와 같다 — 검증 → 새 파일 저장(트랜잭션 밖) → 트랜잭션 →
   * **성공 시 이전 파일 삭제 / 실패 시 새 파일 삭제.** 지우는 순서가 반대인 것만 다르다.
   * 이전 파일을 트랜잭션 전에 지우면 롤백됐을 때 행은 옛 경로를 가리키는데 파일이 없다.
   */
  async republish(command: RepublishContentCommand): Promise<AdminContentView> {
    const changedParts = this.resolveChangedParts(command);
    if (changedParts.length === 0) {
      // 4.10 — 파트가 하나도 없으면 올릴 버전이 없다. 필드는 기본 파트인 `audio`로 가리킨다
      throw this.validationFailed('audio', '바꿀 파트를 하나 이상 보내주세요');
    }

    const audioExtension = command.audio
      ? this.resolveExtension(
          command.audio,
          AUDIO_CONTENT_TYPES,
          MAX_AUDIO_FILE_BYTES,
          'audio',
        )
      : null;
    const thumbnailExtension = command.thumbnail
      ? this.resolveExtension(
          command.thumbnail,
          THUMBNAIL_CONTENT_TYPES,
          MAX_THUMBNAIL_FILE_BYTES,
          'thumbnail',
        )
      : null;

    // 파일을 올리기 전에 막는다 — 200MB를 다 받아 저장한 뒤 409를 주는 건 낭비다
    const target = await this.contentService.getById(command.contentId);
    this.assertRepublishable(target);
    this.validateSourceReplacement(target, command.sources);

    if (command.topicIds) {
      const topics = await this.topicService.findAllByIds(command.topicIds);
      if (topics.length !== new Set(command.topicIds).size) {
        throw new BusinessException({
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.ADMIN_TOPIC_NOT_FOUND,
          message: '존재하지 않는 주제가 있어요',
          details: { field: 'topic_ids' },
        });
      }
    }

    let durationSec: number | null = null;
    if (command.audio) {
      // 4.10 — 길이는 클라이언트 값을 받지 않는다. 새 파일에서 다시 뽑는다(4.6과 동일)
      durationSec = await this.audioProbe.readDurationSec(command.audio);
      if (durationSec === null) {
        throw new BusinessException({
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.ADMIN_AUDIO_UNREADABLE,
          message: '오디오 길이를 읽을 수 없어요. 파일을 확인해 주세요',
          details: { field: 'audio' },
        });
      }
    }

    const uploadedKeys: string[] = [];
    let audioPath: string | undefined;
    let thumbnailUrl: string | undefined;
    try {
      if (command.audio && audioExtension) {
        audioPath = await this.storage.putAudio(command.audio, audioExtension);
        uploadedKeys.push(audioPath);
      }
      if (command.thumbnail && thumbnailExtension) {
        const thumbnail = await this.storage.putThumbnail(
          command.thumbnail,
          thumbnailExtension,
        );
        uploadedKeys.push(thumbnail.key);
        thumbnailUrl = thumbnail.url ?? '';
      }
    } catch (error) {
      await this.storage.remove(uploadedKeys);
      this.logger.error('content republish to storage failed', {
        content_id: command.contentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalServiceException({
        errorCode: ErrorCode.ADMIN_STORAGE_FAILED,
        message: '파일 저장에 실패했어요. 다시 시도해 주세요',
        retryable: true,
      });
    }

    const replacedKeys: string[] = [];
    let content: Content;
    try {
      content = await this.dataSource.transaction(async (manager) => {
        // 파일을 올리는 동안 회수됐을 수 있다 — 트랜잭션 안에서 다시 본다
        const current = await this.contentService.getById(
          command.contentId,
          manager,
        );
        this.assertRepublishable(current);

        const previousVersion = current.contentVersion;
        if (audioPath) {
          replacedKeys.push(current.audioPath);
        }
        if (thumbnailUrl) {
          // `contents`에는 공개 URL만 있고 키가 없다(domain.md 5.1) — URL을 만든 쪽이 되짚는다
          const previousThumbnailKey = this.storage.resolveKey(
            current.thumbnailUrl,
          );
          if (previousThumbnailKey) {
            replacedKeys.push(previousThumbnailKey);
          }
        }

        const republished = await this.contentService.republish(
          current,
          {
            title: command.title,
            description: command.description,
            sourceName: command.sourceName,
            audioPath,
            durationSec: durationSec ?? undefined,
            thumbnailUrl,
            topicIds: command.topicIds
              ? [...new Set(command.topicIds)]
              : undefined,
            sources: command.sources,
          },
          manager,
        );

        /**
         * 낡은 재생 위치 폐기(안 A — `republish-stale-playback-position.md`). 콜드오픈
         * 폐지·재편집처럼 같은 초가 다른 내용을 가리키게 되는 재발행에서, 남은 행이
         * 4.1 응답으로 그대로 내려가 엉뚱한 지점에서 재생이 시작되는 것을 막는다.
         * 저장 경로(4.3)는 버전 가드가 이미 막고 있어 읽기 경로만 남아 있었다.
         * 라이브러리·재생 기록은 유지된다 — 지우는 것은 위치뿐이다.
         */
        await this.playbackService.deleteProgressesByContentId(
          command.contentId,
          manager,
        );

        await this.auditLogService.record(
          {
            actor: command.actorUserId,
            action: AUDIT_ACTION_CONTENT_REPUBLISH,
            target: `content:${command.contentId}`,
            before: { content_version: previousVersion },
            after: {
              content_version: republished.contentVersion,
              changed_parts: changedParts,
              ...(durationSec !== null && { duration_sec: durationSec }),
            },
          },
          manager,
        );

        return republished;
      });
    } catch (error) {
      await this.storage.remove(uploadedKeys);
      throw error;
    }

    // 여기서부터는 실패해도 재발행 자체는 성공이다 — 남은 파일은 정리 대상일 뿐이다
    await this.storage.remove(replacedKeys);

    this.logger.log('content republished', {
      content_id: content.id,
      content_version: content.contentVersion,
      changed_parts: changedParts,
      actor: command.actorUserId,
    });

    return this.toView(content);
  }

  /**
   * 4.10 — `published`가 아니면 재발행하지 않는다. 회수·만료 상태의 콘텐츠를 갈아끼우면
   * 노출되지 않는 콘텐츠의 버전만 올라 클라이언트 캐시를 헛되이 버리게 한다
   * (`admin.md` 4.6 "만료 상태에서는 재발행을 막는다").
   */
  private assertRepublishable(content: Content): void {
    if (content.status !== ContentStatus.PUBLISHED) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.CONFLICT,
        message: '발행 중인 콘텐츠만 재발행할 수 있어요',
      });
    }
  }

  /**
   * 출처 교체는 **업로드(4.6)가 세운 공시 규칙을 그대로 지킨다**(admin.md 3.1).
   * 재발행으로 `ai_generated`의 출처를 비우거나 `partner`에 출처를 붙이면, 업로드로는 만들
   * 수 없는 행이 재발행으로만 생긴다. `origin`은 재발행이 바꾸지 못하므로 기존 값으로 본다.
   */
  private validateSourceReplacement(
    content: Content,
    sources: SourceInput[] | undefined,
  ): void {
    if (sources === undefined) {
      return;
    }

    if (content.origin === ContentOrigin.AI_GENERATED && sources.length === 0) {
      throw this.validationFailed(
        'sources',
        'AI 생성 콘텐츠는 참고 소스가 1개 이상 필요해요',
      );
    }
    if (content.origin === ContentOrigin.PARTNER && sources.length > 0) {
      throw this.validationFailed(
        'sources',
        '파트너 콘텐츠에는 참고 소스를 넣지 않아요',
      );
    }
  }

  /** 감사 로그의 `changed_parts` — 최소 1개 판정도 이 목록으로 한다 */
  private resolveChangedParts(command: RepublishContentCommand): string[] {
    const parts: string[] = [];
    if (command.audio) {
      parts.push('audio');
    }
    if (command.thumbnail) {
      parts.push('thumbnail');
    }
    for (const [name, value] of [
      ['title', command.title],
      ['description', command.description],
      ['source_name', command.sourceName],
      ['topic_ids', command.topicIds],
      ['sources', command.sources],
    ] as const) {
      if (value !== undefined) {
        parts.push(name);
      }
    }

    return parts;
  }

  /**
   * 회수(FR-32) — partner-control.md 4.3 순서대로 한 트랜잭션에서:
   * ① `status = withdrawn` + `withdrawn_at` ② 전 사용자 `library_items` 삭제 ③ 감사 로그.
   * 서명 URL 신규 발급은 상태 전환 즉시 막히고(발급 경로가 `getPublishedById`),
   * 이미 발급된 URL은 5분 만료로 소멸한다(4.3-2).
   */
  async withdraw(
    actorUserId: string,
    contentId: string,
    reason: string | null,
    now: Date,
  ): Promise<AdminContentView> {
    const content = await this.dataSource.transaction(async (manager) => {
      const target = await this.contentService.getById(contentId, manager);

      if (target.status === ContentStatus.WITHDRAWN) {
        throw new BusinessException({
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.CONFLICT,
          message: '이미 회수된 콘텐츠예요',
        });
      }

      const withdrawn = await this.contentService.withdraw(
        target,
        now,
        manager,
      );
      const removedCount =
        await this.libraryService.removeAllByWithdrawnContent(
          contentId,
          now,
          manager,
        );
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_CONTENT_WITHDRAW,
          target: `content:${contentId}`,
          after: { reason, removed_library_items: removedCount },
        },
        manager,
      );

      return withdrawn;
    });

    this.logger.log('content withdrawn', {
      content_id: contentId,
      actor: actorUserId,
    });

    return this.toView(content);
  }

  /**
   * 회수 복구 — `published`로 되돌린다. **삭제된 `library_items`는 복구하지 않는다**
   * (partner-control.md 4.3 "되돌리기" — 담기로 다시 들어올 수 있다).
   */
  async restore(
    actorUserId: string,
    contentId: string,
  ): Promise<AdminContentView> {
    const content = await this.dataSource.transaction(async (manager) => {
      const target = await this.contentService.getById(contentId, manager);

      if (target.status !== ContentStatus.WITHDRAWN) {
        throw new BusinessException({
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.CONFLICT,
          message: '회수된 콘텐츠가 아니에요',
        });
      }

      const restored = await this.contentService.restoreWithdrawn(
        target,
        manager,
      );
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_CONTENT_RESTORE,
          target: `content:${contentId}`,
        },
        manager,
      );

      return restored;
    });

    this.logger.log('content restored', {
      content_id: contentId,
      actor: actorUserId,
    });

    return this.toView(content);
  }

  private async toView(content: Content): Promise<AdminContentView> {
    const topicViews = await this.contentService.findTopicViews([content.id]);

    return {
      content,
      topics: topicViews.map((view) => ({
        topicId: view.topicId,
        name: view.name,
      })),
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
