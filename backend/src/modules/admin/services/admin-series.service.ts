import { rm } from 'node:fs/promises';

import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ExternalServiceException } from '@/common/exceptions/external-service.exception';
import {
  CreateSeriesCommand,
  UpdateSeriesCommand,
} from '@/modules/content/content.types';
import { Series } from '@/modules/content/entities/series.entity';
import {
  SeriesService,
  SeriesWithCounts,
} from '@/modules/content/services/series.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import {
  AUDIT_ACTION_SERIES_COVER,
  AUDIT_ACTION_SERIES_CREATE,
  AUDIT_ACTION_SERIES_UPDATE,
  MAX_THUMBNAIL_FILE_BYTES,
  THUMBNAIL_CONTENT_TYPES,
} from '../admin.constant';
import { UploadedFileInput } from '../admin.types';
import { ContentStorageClient } from '../content-storage.client';
import { ThumbnailImage } from '../thumbnail-image';
import {
  resolveUploadExtension,
  uploadValidationFailed,
} from '../upload-file.validation';

/** 표지 파일 필드 이름 — 400 `details.field`에도 이 이름이 실린다(콘솔이 필드 옆에 에러를 그린다) */
export const SERIES_COVER_FIELD = 'cover';

/**
 * 시리즈 관리(KAN-134 확정 설계 2번). 쓰기와 감사 기록을 **한 트랜잭션**으로 묶는다(공지·초대 코드 관리와 같은 구조).
 * 시리즈를 지우는 API는 없다 — 편이 FK로 가리키고, 회수는 편 단위(시리즈 전 편 회수는 파이프라인이 편마다 부른다).
 */
@Injectable()
export class AdminSeriesService {
  private readonly logger = new Logger(AdminSeriesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly seriesService: SeriesService,
    private readonly auditLogService: AuditLogService,
    private readonly storage: ContentStorageClient,
    private readonly thumbnailImage: ThumbnailImage,
  ) {}

  async findAll(): Promise<SeriesWithCounts[]> {
    return this.seriesService.findAllWithCounts();
  }

  async create(
    actorUserId: string,
    command: CreateSeriesCommand,
  ): Promise<SeriesWithCounts> {
    const created = await this.dataSource.transaction(async (manager) => {
      const series = await this.seriesService.create(command, manager);
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_SERIES_CREATE,
          target: `series:${series.id}`,
          after: snapshot(series),
        },
        manager,
      );
      return series;
    });

    this.logger.log('series created', {
      series_id: created.id,
      actor: actorUserId,
    });

    // 막 만든 시리즈는 편이 없다
    return {
      series: created,
      counts: await this.seriesService.getCounts(created.id),
    };
  }

  async update(
    actorUserId: string,
    seriesId: string,
    command: UpdateSeriesCommand,
  ): Promise<SeriesWithCounts> {
    const updated = await this.dataSource.transaction(async (manager) => {
      // 업로드 검증과 같은 행 잠금 — 편수를 줄이는 사이에 큰 번호 편이 올라가 하한을 넘지 않게
      const current = await this.seriesService.getByIdForUpdate(
        seriesId,
        manager,
      );
      const before = snapshot(current);
      const saved = await this.seriesService.update(current, command, manager);
      await this.auditLogService.record(
        {
          actor: actorUserId,
          action: AUDIT_ACTION_SERIES_UPDATE,
          target: `series:${saved.id}`,
          before,
          after: snapshot(saved),
        },
        manager,
      );
      return saved;
    });

    this.logger.log('series updated', {
      series_id: updated.id,
      actor: actorUserId,
    });

    return {
      series: updated,
      counts: await this.seriesService.getCounts(updated.id),
    };
  }

  /**
   * 표지 올리기·교체(`PUT /admin/series/:id/cover`, KAN-234). **콘텐츠 썸네일과 같은 길을 그대로 밟는다**(admin-api.md 4.6 · 4.10):
   *
   * 1. 형식·크기 — jpg/jpeg/png/webp, 5MB 이하. 어긋나면 400 `VALIDATION_FAILED`(`details.field = "cover"`). 판정 함수가 같다.
   * 2. 없는 시리즈는 저장소에 올리기 전에 404(잠그지 않는 사전 확인).
   * 3. 저장 규격(WebP 긴 변 768px)으로 다시 쓴다 — 읽지 못하는 이미지는 400(`cover`).
   * 4. `putThumbnail`로 올린다(`thumb/` 접두사 — 그래야 `resolveKey`가 다음 교체 때 되짚어 지운다). 실패하면 502 `ADMIN_STORAGE_FAILED`.
   * 5. 트랜잭션 — 시리즈 행을 잠그고(관리자 수정·편 업로드와 같은 잠금) 표지를 바꾸고 감사 기록(`series.cover`)을 남긴다.
   *    실패하면 방금 올린 객체를 지운다.
   * 6. **커밋 뒤 옛 표지 객체를 지운다** — 재발행이 옛 썸네일을 지우는 것과 같다. 지우지 못해도 교체는 성공이다(남는 파일은 정리 대상일 뿐).
   */
  async replaceCover(
    actorUserId: string,
    seriesId: string,
    file: UploadedFileInput,
  ): Promise<SeriesWithCounts> {
    resolveUploadExtension(
      file,
      THUMBNAIL_CONTENT_TYPES,
      MAX_THUMBNAIL_FILE_BYTES,
      SERIES_COVER_FIELD,
    );
    await this.seriesService.getById(seriesId);

    const normalized = await this.thumbnailImage.normalize(file);
    if (!normalized) {
      throw uploadValidationFailed(
        SERIES_COVER_FIELD,
        '이미지를 읽을 수 없어요. 파일을 확인해 주세요',
      );
    }

    let stored: { key: string; url: string };
    try {
      const result = await this.storage.putThumbnail(
        normalized.file,
        normalized.extension,
      );
      stored = { key: result.key, url: result.url ?? '' };
    } catch (error) {
      this.logger.error('series cover upload to storage failed', {
        series_id: seriesId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ExternalServiceException({
        errorCode: ErrorCode.ADMIN_STORAGE_FAILED,
        message: '파일 저장에 실패했어요. 다시 시도해 주세요',
        retryable: true,
      });
    } finally {
      await rm(normalized.file.path, { force: true });
    }

    const replacedKeys: string[] = [];
    let updated: Series;
    try {
      updated = await this.dataSource.transaction(async (manager) => {
        const current = await this.seriesService.getByIdForUpdate(
          seriesId,
          manager,
        );
        // `series`에는 공개 URL만 있다(`contents.thumbnail_url`과 같다) — URL을 만든 쪽이 키로 되짚는다. 남의 URL이면 null
        const previousKey = current.coverUrl
          ? this.storage.resolveKey(current.coverUrl)
          : null;
        if (previousKey) {
          replacedKeys.push(previousKey);
        }
        const before = snapshot(current);
        const saved = await this.seriesService.updateCover(
          current,
          stored.url,
          manager,
        );
        await this.auditLogService.record(
          {
            actor: actorUserId,
            action: AUDIT_ACTION_SERIES_COVER,
            target: `series:${saved.id}`,
            before: { cover_url: before.cover_url },
            after: {
              cover_url: saved.coverUrl,
              width: normalized.width,
              height: normalized.height,
            },
          },
          manager,
        );
        return saved;
      });
    } catch (error) {
      await this.storage.remove([stored.key]);
      throw error;
    }

    const failedKeys = await this.storage.remove(replacedKeys);
    if (failedKeys.length > 0) {
      this.logger.warn('previous series cover not removed', {
        series_id: seriesId,
        keys: failedKeys,
      });
    }

    this.logger.log('series cover replaced', {
      series_id: updated.id,
      actor: actorUserId,
    });

    return {
      series: updated,
      counts: await this.seriesService.getCounts(updated.id),
    };
  }
}

/** 소개는 길 수 있어 길이만 남긴다 — 감사 로그는 "무엇이 바뀌었나"를 추적하는 용도다(공지와 같은 규칙) */
function snapshot(series: Series): Record<string, unknown> {
  return {
    title: series.title,
    description_length: series.description.length,
    total_episodes: series.totalEpisodes,
    status: series.status,
    cover_url: series.coverUrl ?? null,
  };
}
