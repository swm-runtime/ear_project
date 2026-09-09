import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { TopicService } from '@/modules/interest/services/topic.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';

import { AdminContentService } from './admin-content.service';
import {
  RepublishContentCommand,
  UploadContentCommand,
  UploadedFileInput,
} from '../admin.types';
import { AudioProbe } from '../audio-probe';
import { ContentStorageClient } from '../content-storage.client';

// `music-metadata`는 ESM 전용이라 jest(CJS)가 실제 모듈을 읽지 못한다. Probe는 mock 대상이다
jest.mock('../audio-probe', () => ({ AudioProbe: class {} }));

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_ID = '22222222-2222-4222-8222-222222222222';
const CONTENT_ID = '33333333-3333-4333-8333-333333333333';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-08-30T10:00:00Z');
const CDN_BASE_URL = 'https://cdn.example';

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

/** enrichment.json 파일 — 내용이 있는 JSON 버퍼로 만든다 */
function buildEnrichmentFile(value: unknown): UploadedFileInput {
  const buffer = Buffer.from(JSON.stringify(value), 'utf8');
  return {
    buffer,
    originalName: 'enrichment.json',
    mimeType: 'application/json',
    size: buffer.length,
  };
}

const VALID_ENRICHMENT = { difficulty: 'beginner', keywords: ['이직 준비'] };

function buildRepublishCommand(
  overrides: Partial<RepublishContentCommand> = {},
): RepublishContentCommand {
  return {
    actorUserId: ACTOR_ID,
    contentId: CONTENT_ID,
    audio: buildFile('ep.mp3'),
    thumbnail: null,
    enrichment: null,
    ...overrides,
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
    enrichment: null,
    ...overrides,
  };
}

describe('AdminContentService', () => {
  let service: AdminContentService;
  let contentService: jest.Mocked<ContentService>;
  let libraryService: jest.Mocked<LibraryService>;
  let playbackService: jest.Mocked<PlaybackService>;
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
      getById: jest.fn().mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.PUBLISHED,
        origin: ContentOrigin.AI_GENERATED,
        contentVersion: 2,
        audioPath: 'audio/old.mp3',
        thumbnailUrl: `${CDN_BASE_URL}/thumb/old.png`,
      }),
      // 재발행 트랜잭션은 행을 잠그고 다시 읽는다 — 같은 행을 돌려준다
      getByIdForUpdate: jest.fn().mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.PUBLISHED,
        origin: ContentOrigin.AI_GENERATED,
        contentVersion: 2,
        audioPath: 'audio/old.mp3',
        thumbnailUrl: `${CDN_BASE_URL}/thumb/old.png`,
      }),
      withdraw: jest
        .fn()
        .mockResolvedValue({ id: CONTENT_ID, status: ContentStatus.WITHDRAWN }),
      restoreWithdrawn: jest
        .fn()
        .mockResolvedValue({ id: CONTENT_ID, status: ContentStatus.PUBLISHED }),
      republish: jest.fn().mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.PUBLISHED,
        contentVersion: 3,
      }),
      findAdminPage: jest.fn(),
      findTopicViews: jest.fn().mockResolvedValue([]),
      applyEnrichment: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ContentService>;

    libraryService = {
      removeAllByWithdrawnContent: jest.fn().mockResolvedValue(3),
    } as unknown as jest.Mocked<LibraryService>;

    playbackService = {
      deleteProgressesByContentId: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PlaybackService>;

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
        url: `${CDN_BASE_URL}/thumb/def.png`,
      }),
      remove: jest.fn().mockResolvedValue(undefined),
      // 실제 구현과 같은 규칙 — 공개 URL 접두어를 떼고 키만 남긴다
      resolveKey: jest.fn((url: string) =>
        url.startsWith(CDN_BASE_URL)
          ? url.slice(CDN_BASE_URL.length + 1)
          : null,
      ),
    } as unknown as jest.Mocked<ContentStorageClient>;

    audioProbe = {
      readDurationSec: jest.fn().mockResolvedValue(600),
    };

    service = new AdminContentService(
      dataSource,
      contentService,
      libraryService,
      playbackService,
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
          thumbnailUrl: `${CDN_BASE_URL}/thumb/def.png`,
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
    });

    it('유효한 추천 메타 파일을 첨부하면 같은 트랜잭션에서 저장되고 응답에 적용이 표시된다', async () => {
      // given
      const command = buildCommand({
        enrichment: buildEnrichmentFile(VALID_ENRICHMENT),
      });

      // when
      const result = await service.upload(command, NOW);

      // then
      expect(contentService.applyEnrichment).toHaveBeenCalledWith(
        containing({ id: CONTENT_ID }),
        { difficulty: 'beginner', keywords: ['이직 준비'] },
        manager,
      );
      expect(result.enrichment).toEqual({
        applied: true,
        rejectedReason: null,
      });
    });

    it('추천 메타 파일이 어긋나면 파일만 거부되고 업로드는 진행된다', async () => {
      // given — enum에 없는 값 (admin.md 3.1 — 추천 메타는 발행 요건이 아니다)
      const command = buildCommand({
        enrichment: buildEnrichmentFile({ difficulty: 'expert' }),
      });

      // when
      const result = await service.upload(command, NOW);

      // then
      expect(contentService.publish).toHaveBeenCalled();
      expect(contentService.applyEnrichment).not.toHaveBeenCalled();
      expect(result.enrichment?.applied).toBe(false);
      expect(result.enrichment?.rejectedReason).toContain('difficulty');
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

    it('예외는 BusinessException이다', async () => {
      // given
      const command = buildCommand({ reviewConfirmed: false });

      // when
      const act = service.upload(command, NOW);

      // then
      await expect(act).rejects.toBeInstanceOf(BusinessException);
    });
  });

  describe('withdraw', () => {
    it('회수하면 상태 전환·라이브러리 일괄 삭제·감사 로그가 한 트랜잭션에서 일어난다', async () => {
      // when
      const result = await service.withdraw(
        ACTOR_ID,
        CONTENT_ID,
        '품질 문제',
        NOW,
      );

      // then
      expect(result.content.status).toBe(ContentStatus.WITHDRAWN);
      expect(contentService.withdraw).toHaveBeenCalledWith(
        expect.objectContaining({ id: CONTENT_ID }),
        NOW,
        manager,
      );
      expect(libraryService.removeAllByWithdrawnContent).toHaveBeenCalledWith(
        CONTENT_ID,
        NOW,
        manager,
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        containing({
          action: 'content.withdraw',
          target: `content:${CONTENT_ID}`,
        }),
        manager,
      );
    });

    it('이미 회수된 콘텐츠를 다시 회수하면 409로 거부한다', async () => {
      // given
      contentService.getById.mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.WITHDRAWN,
      } as never);

      // when
      const act = service.withdraw(ACTOR_ID, CONTENT_ID, null, NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.CONFLICT,
      });
      expect(libraryService.removeAllByWithdrawnContent).not.toHaveBeenCalled();
    });
  });

  describe('purgeStorage', () => {
    beforeEach(() => {
      contentService.getById.mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.WITHDRAWN,
        origin: ContentOrigin.AI_GENERATED,
        title: '정리할 콘텐츠',
        sourceName: '블로그 A',
        publishedAt: NOW,
        withdrawnAt: NOW,
        audioPath: 'audio/old.mp3',
        thumbnailUrl: `${CDN_BASE_URL}/thumb/old.png`,
      } as never);
    });

    it('회수된 콘텐츠의 오디오·썸네일을 저장소에서 지운다', async () => {
      // when
      await service.purgeStorage(ACTOR_ID, CONTENT_ID);

      // then
      expect(storage.remove).toHaveBeenCalledWith([
        'audio/old.mp3',
        'thumb/old.png',
      ]);
    });

    it('행은 지우지 않는다 — play_records가 정산의 원본 근거다', async () => {
      // given / when
      await service.purgeStorage(ACTOR_ID, CONTENT_ID);

      // then — contents 행을 지우면 그것을 참조하는 재생 기록이 함께 사라져야 하고,
      // 집계(content_stats)만 남으면 정산 수치를 되짚을 수 없다
      expect(contentService.withdraw).not.toHaveBeenCalled();
      expect(storage.remove).toHaveBeenCalledTimes(1);
    });

    it('파일이 사라지기 전에 감사 로그를 같은 트랜잭션에서 남긴다', async () => {
      // given — 되돌릴 수 없는 작업이라, 이 기록이 "왜 재생이 안 되는지"의 유일한 설명이다

      // when
      await service.purgeStorage(ACTOR_ID, CONTENT_ID);

      // then
      expect(auditLogService.record).toHaveBeenCalledWith(
        containing({
          actor: ACTOR_ID,
          action: 'content.purge_storage',
          target: `content:${CONTENT_ID}`,
          before: containing({ title: '정리할 콘텐츠' }),
        }),
        manager,
      );
    });

    it('발행 중인 콘텐츠는 409로 거부한다 — 회수가 먼저다', async () => {
      // given
      contentService.getById.mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.PUBLISHED,
      } as never);

      // when
      const act = service.purgeStorage(ACTOR_ID, CONTENT_ID);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.CONFLICT,
      });
      expect(storage.remove).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('회수된 콘텐츠를 복구하면 published로 돌아가고 감사 로그가 남는다', async () => {
      // given
      contentService.getById.mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.WITHDRAWN,
      } as never);

      // when
      const result = await service.restore(ACTOR_ID, CONTENT_ID);

      // then
      expect(result.content.status).toBe(ContentStatus.PUBLISHED);
      expect(auditLogService.record).toHaveBeenCalledWith(
        containing({ action: 'content.restore' }),
        manager,
      );
    });

    it('회수 상태가 아닌 콘텐츠의 복구는 409로 거부한다', async () => {
      // when
      const act = service.restore(ACTOR_ID, CONTENT_ID);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.CONFLICT,
      });
    });
  });

  describe('republish', () => {
    it('오디오만 보내면 같은 행의 경로·길이를 갈아끼우고 버전을 올린 뒤 이전 파일을 지운다', async () => {
      // when
      const result = await service.republish(buildRepublishCommand());

      // then — 트랜잭션 안 재확인은 행 잠금(FOR UPDATE)으로 읽는다 (동시 재발행 경합 차단)
      expect(result.content.id).toBe(CONTENT_ID);
      expect(contentService.getByIdForUpdate).toHaveBeenCalledWith(
        CONTENT_ID,
        manager,
      );
      expect(contentService.republish).toHaveBeenCalledWith(
        expect.objectContaining({ id: CONTENT_ID }),
        containing({ audioPath: 'audio/abc.mp3', durationSec: 600 }),
        manager,
      );
      // 새 파일 저장 → 트랜잭션 성공 → **그 다음에** 이전 파일 삭제 (반대면 롤백 시 파일이 없다)
      expect(storage.remove).toHaveBeenCalledWith(['audio/old.mp3']);
    });

    it('오디오와 함께 온 추천 메타 파일은 재발행된 새 버전으로 저장된다', async () => {
      // given
      const command = buildRepublishCommand({
        enrichment: buildEnrichmentFile(VALID_ENRICHMENT),
      });

      // when
      await service.republish(command);

      // then — contentService.republish의 결과(버전 3)가 그대로 저장 입력이다
      expect(contentService.republish).toHaveBeenCalled();
      expect(contentService.applyEnrichment).toHaveBeenCalledWith(
        containing({ contentVersion: 3 }),
        { difficulty: 'beginner', keywords: ['이직 준비'] },
        manager,
      );
    });

    it('추천 메타 파일만 보내면 버전을 올리지 않고 메타만 반영한다 — 소급 부여 경로', async () => {
      // given
      const command = buildRepublishCommand({
        audio: null,
        enrichment: buildEnrichmentFile(VALID_ENRICHMENT),
      });

      // when
      const result = await service.republish(command);

      // then — 재발행이 아니므로 버전 불변·위치 폐기 없음, 감사 로그는 content.enrich
      expect(contentService.republish).not.toHaveBeenCalled();
      expect(
        playbackService.deleteProgressesByContentId,
      ).not.toHaveBeenCalled();
      expect(contentService.applyEnrichment).toHaveBeenCalledWith(
        containing({ contentVersion: 2 }),
        { difficulty: 'beginner', keywords: ['이직 준비'] },
        manager,
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        containing({ action: 'content.enrich' }),
        manager,
      );
      expect(result.enrichment?.applied).toBe(true);
    });

    it('추천 메타 파일만 보냈는데 어긋나면 아무것도 바꾸지 않고 거부 사유만 돌려준다', async () => {
      // given
      const command = buildRepublishCommand({
        audio: null,
        enrichment: buildEnrichmentFile({ format: 'podcast' }),
      });

      // when
      const result = await service.republish(command);

      // then
      expect(contentService.applyEnrichment).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
      expect(result.enrichment?.applied).toBe(false);
      expect(result.enrichment?.rejectedReason).toContain('format');
    });

    it('재발행하면 그 콘텐츠의 저장된 재생 위치가 같은 트랜잭션에서 전부 지워진다', async () => {
      // when
      await service.republish(buildRepublishCommand());

      // then — 안 A(`republish-stale-playback-position.md`): 읽기 경로(4.1)가 낡은
      // 위치를 내려주지 않도록 행 자체를 지운다. 라이브러리는 건드리지 않는다
      expect(playbackService.deleteProgressesByContentId).toHaveBeenCalledWith(
        CONTENT_ID,
        manager,
      );
      expect(libraryService.removeAllByWithdrawnContent).not.toHaveBeenCalled();
    });

    it('재발행이 거부되면 재생 위치를 지우지 않는다', async () => {
      // given — 회수 상태라 409로 거부되는 경우
      contentService.getById.mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.WITHDRAWN,
        origin: ContentOrigin.AI_GENERATED,
        contentVersion: 2,
        audioPath: 'audio/old.mp3',
        thumbnailUrl: `${CDN_BASE_URL}/thumb/old.png`,
      } as never);

      // when
      const act = service.republish(buildRepublishCommand());

      // then
      await expect(act).rejects.toBeInstanceOf(BusinessException);
      expect(
        playbackService.deleteProgressesByContentId,
      ).not.toHaveBeenCalled();
    });

    it('메타만 보내도 content_version은 오른다 — 클라이언트 재발행 판정이 버전 하나로 동작한다', async () => {
      // given
      const command = buildRepublishCommand({ audio: null, title: '새 제목' });

      // when
      await service.republish(command);

      // then
      expect(contentService.republish).toHaveBeenCalledWith(
        expect.anything(),
        containing({ title: '새 제목', audioPath: undefined }),
        manager,
      );
      expect(storage.putAudio).not.toHaveBeenCalled();
      // 바뀐 파일이 없으므로 지울 것도 없다
      expect(storage.remove).toHaveBeenCalledWith([]);
    });

    it('바꿀 파트가 하나도 없으면 audio 필드를 가리키며 거부한다', async () => {
      // given
      const command = buildRepublishCommand({ audio: null, thumbnail: null });

      // when
      const act = service.republish(command);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'audio' },
      });
      expect(contentService.getById).not.toHaveBeenCalled();
    });

    it('회수된 콘텐츠는 파일을 올리기 전에 409로 거부한다', async () => {
      // given
      contentService.getById.mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.WITHDRAWN,
      } as never);

      // when
      const act = service.republish(buildRepublishCommand());

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.CONFLICT,
      });
      expect(storage.putAudio).not.toHaveBeenCalled();
    });

    it('오디오 길이를 읽을 수 없으면 파일을 올리지 않고 거부한다', async () => {
      // given
      audioProbe.readDurationSec.mockResolvedValue(null);

      // when
      const act = service.republish(buildRepublishCommand());

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_AUDIO_UNREADABLE,
      });
      expect(storage.putAudio).not.toHaveBeenCalled();
    });

    it('존재하지 않는 주제로 교체하려 하면 거부한다', async () => {
      // given
      topicService.findAllByIds.mockResolvedValue([]);
      const command = buildRepublishCommand({ topicIds: [TOPIC_ID] });

      // when
      const act = service.republish(command);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_TOPIC_NOT_FOUND,
        details: { field: 'topic_ids' },
      });
    });

    it('트랜잭션이 실패하면 새로 올린 파일을 지우고 이전 파일은 남긴다', async () => {
      // given
      contentService.republish.mockRejectedValue(new Error('db down'));

      // when
      const act = service.republish(buildRepublishCommand());

      // then
      await expect(act).rejects.toThrow('db down');
      expect(storage.remove).toHaveBeenCalledWith(['audio/abc.mp3']);
      expect(storage.remove).not.toHaveBeenCalledWith(['audio/old.mp3']);
    });

    it('감사 로그에 행위자와 이전·이후 버전, 바뀐 파트가 남는다', async () => {
      // given
      const command = buildRepublishCommand({ title: '새 제목' });

      // when
      await service.republish(command);

      // then
      expect(auditLogService.record).toHaveBeenCalledWith(
        containing({
          actor: ACTOR_ID,
          action: 'content.republish',
          target: `content:${CONTENT_ID}`,
          before: { content_version: 2 },
          after: containing({
            content_version: 3,
            changed_parts: ['audio', 'title'],
          }),
        }),
        manager,
      );
    });

    it('AI 생성 콘텐츠의 참고 소스를 비우려 하면 거부한다 — 업로드가 막는 상태를 재발행으로 만들지 않는다', async () => {
      // given
      contentService.getById.mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.PUBLISHED,
        origin: ContentOrigin.AI_GENERATED,
        contentVersion: 2,
        audioPath: 'audio/old.mp3',
        thumbnailUrl: `${CDN_BASE_URL}/thumb/old.png`,
      } as never);
      const command = buildRepublishCommand({ audio: null, sources: [] });

      // when
      const act = service.republish(command);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'sources' },
      });
    });

    it('파트너 콘텐츠에 참고 소스를 붙이려 하면 거부한다', async () => {
      // given
      contentService.getById.mockResolvedValue({
        id: CONTENT_ID,
        status: ContentStatus.PUBLISHED,
        origin: ContentOrigin.PARTNER,
        contentVersion: 2,
        audioPath: 'audio/old.mp3',
        thumbnailUrl: `${CDN_BASE_URL}/thumb/old.png`,
      } as never);
      const command = buildRepublishCommand({
        audio: null,
        sources: [{ title: '블로그 A', author: null, url: null }],
      });

      // when
      const act = service.republish(command);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'sources' },
      });
    });

    it('썸네일을 바꾸면 공개 URL에서 되짚은 이전 키를 지운다', async () => {
      // given
      const command = buildRepublishCommand({
        audio: null,
        thumbnail: buildFile('thumb.png'),
      });

      // when
      await service.republish(command);

      // then
      expect(storage.remove).toHaveBeenCalledWith(['thumb/old.png']);
    });
  });
});
