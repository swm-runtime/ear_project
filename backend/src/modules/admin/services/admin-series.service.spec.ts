import { HttpStatus } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ExternalServiceException } from '@/common/exceptions/external-service.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import {
  ContentLengthProfile,
  SeriesStatus,
} from '@/modules/content/content.enum';
import { Series } from '@/modules/content/entities/series.entity';
import { SeriesService } from '@/modules/content/services/series.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import {
  AUDIT_ACTION_SERIES_COVER,
  MAX_THUMBNAIL_FILE_BYTES,
} from '../admin.constant';
import { UploadedFileInput } from '../admin.types';
import { ContentStorageClient } from '../content-storage.client';
import { AdminSeriesService } from './admin-series.service';

const ACTOR = 'admin-1';
const SERIES_ID = '55555555-5555-4555-8555-555555555555';
const MANAGER = {} as EntityManager;
const NOW = new Date('2026-10-21T03:00:00.000Z');
const COUNTS = {
  published: 3,
  withdrawn: 0,
  expired: 0,
  maxPublishedEpisodeNo: 3,
};

function buildSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: SERIES_ID,
    title: '키워드로 훑어보는 경제 상식',
    description: '소개',
    totalEpisodes: 12,
    status: SeriesStatus.ONGOING,
    coverUrl: null,
    publisherName: null,
    lengthProfile: ContentLengthProfile.STANDARD,
    variantOfSeriesId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function coverFile(overrides: Partial<UploadedFileInput> = {}) {
  return {
    path: '/tmp/cover-upload',
    originalName: 'thumb-cover.png',
    mimeType: 'image/png',
    size: 1024 * 1024,
    ...overrides,
  };
}

/**
 * 표지 교체(KAN-234) — 검증은 콘텐츠 `thumbnail`과 같은 함수, 저장은 같은 썸네일 저장소 경로, 옛 객체는 커밋 뒤 지운다.
 * 판정은 진짜 `AdminSeriesService`가 하고, 시리즈 서비스·저장소·이미지 변환·트랜잭션만 대역이다.
 */
describe('AdminSeriesService.replaceCover', () => {
  let service: AdminSeriesService;
  let current: Series;
  let seriesService: {
    getById: jest.Mock;
    getByIdForUpdate: jest.Mock;
    updateCover: jest.Mock;
    getCounts: jest.Mock;
  };
  let storage: {
    putThumbnail: jest.Mock;
    remove: jest.Mock;
    resolveKey: jest.Mock;
  };
  let thumbnailImage: { normalize: jest.Mock };
  let auditLogService: { record: jest.Mock };

  beforeEach(() => {
    current = buildSeries();
    seriesService = {
      getById: jest.fn(() => Promise.resolve(current)),
      getByIdForUpdate: jest.fn(() => Promise.resolve(current)),
      updateCover: jest.fn((series: Series, coverUrl: string) =>
        Promise.resolve({ ...series, coverUrl }),
      ),
      getCounts: jest.fn().mockResolvedValue(COUNTS),
    };
    storage = {
      putThumbnail: jest.fn().mockResolvedValue({
        key: 'thumb/new.webp',
        url: 'https://cdn.example/thumb/new.webp',
      }),
      remove: jest.fn().mockResolvedValue([]),
      resolveKey: jest.fn((url: string) =>
        url.startsWith('https://cdn.example/')
          ? url.slice('https://cdn.example/'.length)
          : null,
      ),
    };
    thumbnailImage = {
      normalize: jest.fn((file: UploadedFileInput) =>
        Promise.resolve({
          file: { ...file, path: `${file.path}.webp`, mimeType: 'image/webp' },
          extension: 'webp',
          width: 768,
          height: 768,
        }),
      ),
    };
    auditLogService = { record: jest.fn().mockResolvedValue({}) };
    const dataSource = {
      transaction: <T>(work: (manager: EntityManager) => Promise<T>) =>
        work(MANAGER),
    };

    service = new AdminSeriesService(
      dataSource as unknown as DataSource,
      seriesService as unknown as SeriesService,
      auditLogService as unknown as AuditLogService,
      storage as unknown as ContentStorageClient,
      thumbnailImage,
    );
  });

  it('처음 올리면 WebP로 다시 써서 썸네일 저장소에 올리고 표지 URL을 저장한다 — 지울 옛 객체는 없다', async () => {
    // when
    const result = await service.replaceCover(ACTOR, SERIES_ID, coverFile());

    // then
    expect(thumbnailImage.normalize).toHaveBeenCalled();
    expect(storage.putThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/webp' }),
      'webp',
    );
    expect(seriesService.updateCover).toHaveBeenCalledWith(
      current,
      'https://cdn.example/thumb/new.webp',
      MANAGER,
    );
    expect(result.series.coverUrl).toBe('https://cdn.example/thumb/new.webp');
    expect(result.counts).toEqual(COUNTS);
    expect(storage.remove).toHaveBeenCalledWith([]);
  });

  it('감사 로그(series.cover)를 같은 트랜잭션에 남긴다 — 이전·새 표지 URL', async () => {
    // given
    current = buildSeries({ coverUrl: 'https://cdn.example/thumb/old.webp' });

    // when
    await service.replaceCover(ACTOR, SERIES_ID, coverFile());

    // then
    expect(auditLogService.record).toHaveBeenCalledWith(
      {
        actor: ACTOR,
        action: AUDIT_ACTION_SERIES_COVER,
        target: `series:${SERIES_ID}`,
        before: { cover_url: 'https://cdn.example/thumb/old.webp' },
        after: {
          cover_url: 'https://cdn.example/thumb/new.webp',
          width: 768,
          height: 768,
        },
      },
      MANAGER,
    );
  });

  it('교체하면 커밋 뒤 옛 표지 객체를 지운다 — 콘텐츠 썸네일 재발행과 같다', async () => {
    // given
    current = buildSeries({ coverUrl: 'https://cdn.example/thumb/old.webp' });

    // when
    await service.replaceCover(ACTOR, SERIES_ID, coverFile());

    // then
    expect(storage.remove).toHaveBeenCalledWith(['thumb/old.webp']);
  });

  it('우리가 만들지 않은 URL이면 지우러 가지 않는다', async () => {
    // given
    current = buildSeries({ coverUrl: 'https://elsewhere.example/a.png' });

    // when
    await service.replaceCover(ACTOR, SERIES_ID, coverFile());

    // then
    expect(storage.remove).toHaveBeenCalledWith([]);
  });

  it.each([
    ['6MB', coverFile({ size: 6 * 1024 * 1024 }), '파일이 너무 커요'],
    [
      'gif',
      coverFile({ originalName: 'cover.gif' }),
      '허용되지 않는 파일 형식',
    ],
    ['확장자 없음', coverFile({ originalName: 'cover' }), '허용되지 않는'],
  ])(
    '%s 파일은 400 VALIDATION_FAILED(field = cover)이고 저장소에 올리지 않는다',
    async (_label, file, message) => {
      // when
      const error = await service
        .replaceCover(ACTOR, SERIES_ID, file)
        .catch((caught: unknown) => caught);

      // then
      expect(error).toBeInstanceOf(BusinessException);
      const exception = error as BusinessException;
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.errorCode).toBe(ErrorCode.VALIDATION_FAILED);
      expect(exception.details).toEqual({ field: 'cover' });
      expect(exception.message).toContain(message);
      expect(storage.putThumbnail).not.toHaveBeenCalled();
    },
  );

  it('정확히 5MB는 받는다 — 상한은 콘텐츠 썸네일과 같다', async () => {
    await expect(
      service.replaceCover(
        ACTOR,
        SERIES_ID,
        coverFile({ size: MAX_THUMBNAIL_FILE_BYTES }),
      ),
    ).resolves.toBeDefined();
  });

  it('읽을 수 없는 이미지는 400(field = cover)이다', async () => {
    // given
    thumbnailImage.normalize.mockResolvedValue(null);

    // when
    const error = await service
      .replaceCover(ACTOR, SERIES_ID, coverFile())
      .catch((caught: unknown) => caught);

    // then
    expect((error as BusinessException).details).toEqual({ field: 'cover' });
    expect(storage.putThumbnail).not.toHaveBeenCalled();
  });

  it('없는 시리즈는 변환·업로드 전에 404다', async () => {
    // given
    seriesService.getById.mockRejectedValue(
      new BusinessNotFoundException({
        errorCode: ErrorCode.NOT_FOUND,
        message: '시리즈를 찾을 수 없어요',
      }),
    );

    // when
    const error = await service
      .replaceCover(ACTOR, SERIES_ID, coverFile())
      .catch((caught: unknown) => caught);

    // then
    expect(error).toBeInstanceOf(BusinessNotFoundException);
    expect(thumbnailImage.normalize).not.toHaveBeenCalled();
    expect(storage.putThumbnail).not.toHaveBeenCalled();
  });

  it('저장소 실패는 502 ADMIN_STORAGE_FAILED(재시도 가능)이고 시리즈 행은 손대지 않는다', async () => {
    // given
    storage.putThumbnail.mockRejectedValue(new Error('S3 down'));

    // when
    const error = await service
      .replaceCover(ACTOR, SERIES_ID, coverFile())
      .catch((caught: unknown) => caught);

    // then
    expect(error).toBeInstanceOf(ExternalServiceException);
    expect((error as ExternalServiceException).errorCode).toBe(
      ErrorCode.ADMIN_STORAGE_FAILED,
    );
    expect(seriesService.updateCover).not.toHaveBeenCalled();
  });

  it('트랜잭션이 실패하면 방금 올린 객체를 지우고 옛 표지는 남긴다', async () => {
    // given
    current = buildSeries({ coverUrl: 'https://cdn.example/thumb/old.webp' });
    auditLogService.record.mockRejectedValue(new Error('db down'));

    // when
    await expect(
      service.replaceCover(ACTOR, SERIES_ID, coverFile()),
    ).rejects.toThrow('db down');

    // then
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(['thumb/new.webp']);
  });
});
