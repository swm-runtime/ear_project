import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { TopicService } from '@/modules/interest/services/topic.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import { AdminContentService } from './admin-content.service';
import { UploadContentCommand, UploadedFileInput } from '../admin.types';
import { AudioProbe } from '../audio-probe';
import { ContentStorageClient } from '../content-storage.client';

// `music-metadata`는 ESM 전용이라 jest(CJS)가 실제 모듈을 읽지 못한다. Probe는 mock 대상이다
jest.mock('../audio-probe', () => ({ AudioProbe: class {} }));

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_ID = '22222222-2222-4222-8222-222222222222';
const CONTENT_ID = '33333333-3333-4333-8333-333333333333';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-08-30T10:00:00Z');

/** `expect.objectContaining`은 any라 lint에 걸린다 — unknown으로 좁힌다 */
const containing = (o: Record<string, unknown>): unknown =>
  expect.objectContaining(o);

function buildFile(name: string, size = 1024): UploadedFileInput {
  return {
    buffer: Buffer.alloc(size),
    originalName: name,
    mimeType: 'application/octet-stream',
    size,
  };
}

function buildCommand(
  overrides: Partial<UploadContentCommand> = {},
): UploadContentCommand {
  return {
    actorUserId: ACTOR_ID,
    title: '테스트 에피소드',
    description: '설명',
    origin: ContentOrigin.AI_GENERATED,
    authorName: null,
    sourceName: '참고한 자료: 블로그 A',
    sourceUrl: null,
    partnerId: null,
    licenseExpiresAt: null,
    seriesId: null,
    episodeNo: null,
    totalEpisodes: null,
    topicIds: [TOPIC_ID],
    sources: [{ title: '블로그 A', author: null, url: null }],
    reviewConfirmed: true,
    audio: buildFile('ep.mp3'),
    thumbnail: buildFile('thumb.png'),
    ...overrides,
  };
}

describe('AdminContentService', () => {
  let service: AdminContentService;
  let contentService: jest.Mocked<ContentService>;
  let topicService: jest.Mocked<TopicService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let storage: jest.Mocked<ContentStorageClient>;
  let audioProbe: jest.Mocked<AudioProbe>;
  let manager: EntityManager;

  beforeEach(() => {
    manager = {} as EntityManager;
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((run: (m: EntityManager) => Promise<unknown>) =>
          run(manager),
        ),
    } as unknown as DataSource;

    contentService = {
      publish: jest.fn().mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.PUBLISHED,
      }),
      findAdminPage: jest.fn(),
      findTopicViews: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ContentService>;

    topicService = {
      findAllByIds: jest
        .fn()
        .mockResolvedValue([{ id: TOPIC_ID, name: '이직' } as Topic]),
    } as unknown as jest.Mocked<TopicService>;

    auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogService>;

    storage = {
      putAudio: jest.fn().mockResolvedValue('audio/abc.mp3'),
      putThumbnail: jest.fn().mockResolvedValue({
        key: 'thumb/def.png',
        url: 'https://cdn.example/thumb/def.png',
      }),
      registerPlayback: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ContentStorageClient>;

    audioProbe = {
      readDurationSec: jest.fn().mockResolvedValue(600),
    };

    service = new AdminContentService(
      dataSource,
      contentService,
      topicService,
      auditLogService,
      storage,
      audioProbe,
    );
  });

  describe('upload', () => {
    it('필수 메타와 오디오를 채워 올리면 즉시 published로 발행되고 감사 로그가 남는다', async () => {
      // given
      const command = buildCommand();

      // when
      const result = await service.upload(command, NOW);

      // then
      expect(result.content.id).toBe(CONTENT_ID);
      expect(result.topics).toEqual([{ topicId: TOPIC_ID, name: '이직' }]);
      expect(contentService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          audioPath: 'audio/abc.mp3',
          durationSec: 600,
          thumbnailUrl: 'https://cdn.example/thumb/def.png',
          topicIds: [TOPIC_ID],
          sources: command.sources,
        }),
        NOW,
        manager,
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: ACTOR_ID,
          action: 'content.upload',
          target: `content:${CONTENT_ID}`,
          after: containing({ review_confirmed: true }),
        }),
        manager,
      );
      expect(storage.registerPlayback).toHaveBeenCalledWith(
        CONTENT_ID,
        'audio/abc.mp3',
      );
    });

    it('검수 완료 확인이 없으면 업로드를 거부한다', async () => {
      // given
      const command = buildCommand({ reviewConfirmed: false });

      // when
      const act = service.upload(command, NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'review_confirmed' },
      });
      expect(storage.putAudio).not.toHaveBeenCalled();
    });

    it('파트너 콘텐츠의 원문 링크를 비우면 어느 필드가 문제인지 알려주며 거부한다', async () => {
      // given
      const command = buildCommand({
        origin: ContentOrigin.PARTNER,
        authorName: '홍길동',
        sourceUrl: null,
        partnerId: PARTNER_ID,
        licenseExpiresAt: new Date('2027-01-01T00:00:00Z'),
        sources: [],
      });

      // when
      const act = service.upload(command, NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'source_url' },
      });
    });

    it('라이선스 만료일이 지난 파트너 콘텐츠는 거부한다', async () => {
      // given
      const command = buildCommand({
        origin: ContentOrigin.PARTNER,
        authorName: '홍길동',
        sourceUrl: 'https://example.com/post',
        partnerId: PARTNER_ID,
        licenseExpiresAt: new Date('2026-01-01T00:00:00Z'),
        sources: [],
      });

      // when
      const act = service.upload(command, NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_LICENSE_EXPIRED,
      });
    });

    it('AI 생성 콘텐츠의 참고 소스가 비어 있으면 거부한다', async () => {
      // given
      const command = buildCommand({ sources: [] });

      // when
      const act = service.upload(command, NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'sources' },
      });
    });

    it('AI 생성 콘텐츠는 source_url·author_name이 없어도 통과한다', async () => {
      // given
      const command = buildCommand({ authorName: null, sourceUrl: null });

      // when
      const result = await service.upload(command, NOW);

      // then
      expect(result.content.id).toBe(CONTENT_ID);
    });

    it('존재하지 않는 주제가 섞여 있으면 거부한다', async () => {
      // given
      topicService.findAllByIds.mockResolvedValue([]);

      // when
      const act = service.upload(buildCommand(), NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_TOPIC_NOT_FOUND,
      });
    });

    it('오디오 길이를 읽을 수 없으면 거부한다', async () => {
      // given
      audioProbe.readDurationSec.mockResolvedValue(null);

      // when
      const act = service.upload(buildCommand(), NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_AUDIO_UNREADABLE,
      });
      expect(storage.putAudio).not.toHaveBeenCalled();
    });

    it('허용되지 않는 확장자의 오디오는 거부한다', async () => {
      // given
      const command = buildCommand({ audio: buildFile('ep.wav') });

      // when
      const act = service.upload(command, NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'audio' },
      });
    });

    it('시리즈인데 편 번호가 총 편수를 넘으면 거부한다', async () => {
      // given
      const command = buildCommand({
        seriesId: '55555555-5555-4555-8555-555555555555',
        episodeNo: 3,
        totalEpisodes: 2,
      });

      // when
      const act = service.upload(command, NOW);

      // then
      await expect(act).rejects.toMatchObject({
        details: { field: 'episode_no' },
      });
    });

    it('썸네일 업로드가 실패하면 먼저 올라간 오디오를 지우고 저장소 오류를 알린다', async () => {
      // given
      storage.putThumbnail.mockRejectedValue(new Error('s3 down'));

      // when
      const act = service.upload(buildCommand(), NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_STORAGE_FAILED,
      });
      expect(storage.remove).toHaveBeenCalledWith(['audio/abc.mp3']);
      expect(contentService.publish).not.toHaveBeenCalled();
    });

    it('재생 경로 등록이 실패하면 트랜잭션이 깨지고 올린 파일을 전부 지운다', async () => {
      // given
      storage.registerPlayback.mockRejectedValue(new Error('kvs down'));

      // when
      const act = service.upload(buildCommand(), NOW);

      // then
      await expect(act).rejects.toThrow('kvs down');
      expect(storage.remove).toHaveBeenCalledWith([
        'audio/abc.mp3',
        'thumb/def.png',
      ]);
    });

    it('예외는 BusinessException이다', async () => {
      // given
      const command = buildCommand({ reviewConfirmed: false });

      // when
      const act = service.upload(command, NOW);

      // then
      await expect(act).rejects.toBeInstanceOf(BusinessException);
    });
  });
});
