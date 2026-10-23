import { EMBEDDING_MODEL_ID } from '../content.constant';
import { ContentTitleEmbedding } from '../entities/content-title-embedding.entity';
import { ContentTitleEmbeddingRepository } from '../repositories/content-title-embedding.repository';
import { TextEmbeddingClient } from '../text-embedding.client';
import { ContentTitleEmbeddingService } from './content-title-embedding.service';

const CONTENT_ID = '33333333-3333-4333-8333-333333333333';
const VECTOR = [0.1, 0.2, 0.3];

describe('ContentTitleEmbeddingService', () => {
  let repository: jest.Mocked<ContentTitleEmbeddingRepository>;
  let client: { enabled: boolean; embed: jest.Mock };
  let service: ContentTitleEmbeddingService;

  beforeEach(() => {
    repository = {
      findByContentId: jest.fn().mockResolvedValue(null),
      findContentsMissingTitleEmbedding: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ContentTitleEmbeddingRepository>;
    client = { enabled: true, embed: jest.fn().mockResolvedValue(VECTOR) };
    service = new ContentTitleEmbeddingService(
      repository,
      client as unknown as TextEmbeddingClient,
    );
  });

  function existing(
    overrides: Partial<ContentTitleEmbedding> = {},
  ): ContentTitleEmbedding {
    return {
      contentId: CONTENT_ID,
      embedding: VECTOR,
      model: EMBEDDING_MODEL_ID,
      sourceText: '금리가 이야기하는 것',
      ...overrides,
    } as ContentTitleEmbedding;
  }

  describe('refresh', () => {
    it('행이 없으면 제목을 임베딩해 현행 모델·제목 글자와 함께 저장한다', async () => {
      // when
      const outcome = await service.refresh({
        id: CONTENT_ID,
        title: '금리가 이야기하는 것',
      });

      // then
      expect(outcome).toBe('created');
      expect(client.embed).toHaveBeenCalledWith('금리가 이야기하는 것');
      expect(repository.upsert).toHaveBeenCalledWith({
        contentId: CONTENT_ID,
        embedding: VECTOR,
        model: EMBEDDING_MODEL_ID,
        sourceText: '금리가 이야기하는 것',
      });
    });

    it('같은 제목·같은 모델의 행이 이미 있으면 AI 서버를 부르지 않는다(제목을 바꾸지 않은 재발행)', async () => {
      // given
      repository.findByContentId.mockResolvedValueOnce(existing());

      // when
      const outcome = await service.refresh({
        id: CONTENT_ID,
        title: '금리가 이야기하는 것',
      });

      // then
      expect(outcome).toBe('unchanged');
      expect(client.embed).not.toHaveBeenCalled();
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('제목이 바뀐 재발행이면 새 제목으로 다시 만든다', async () => {
      // given
      repository.findByContentId.mockResolvedValueOnce(existing());

      // when
      const outcome = await service.refresh({
        id: CONTENT_ID,
        title: '금리는 무엇을 말하나',
      });

      // then
      expect(outcome).toBe('created');
      expect(client.embed).toHaveBeenCalledWith('금리는 무엇을 말하나');
      expect(repository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ sourceText: '금리는 무엇을 말하나' }),
      );
    });

    it('모델이 다른 행은 같은 제목이어도 다시 만든다', async () => {
      // given
      repository.findByContentId.mockResolvedValueOnce(
        existing({ model: 'old-model' }),
      );

      // when
      const outcome = await service.refresh({
        id: CONTENT_ID,
        title: '금리가 이야기하는 것',
      });

      // then
      expect(outcome).toBe('created');
    });

    it('AI 서버 결손(null)이면 저장하지 않고 failed — 던지지 않는다', async () => {
      // given
      client.embed.mockResolvedValueOnce(null);

      // when
      const outcome = await service.refresh({ id: CONTENT_ID, title: '제목' });

      // then
      expect(outcome).toBe('failed');
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('저장 오류(지워진 편의 FK 등)도 failed로 삼킨다 — 발행·재발행 응답을 깨지 않는다', async () => {
      // given
      repository.upsert.mockRejectedValueOnce(new Error('fk violation'));

      // when
      const outcome = await service.refresh({ id: CONTENT_ID, title: '제목' });

      // then
      expect(outcome).toBe('failed');
    });

    it('조회 오류도 failed로 삼킨다', async () => {
      // given
      repository.findByContentId.mockRejectedValueOnce(new Error('db down'));

      // when
      const outcome = await service.refresh({ id: CONTENT_ID, title: '제목' });

      // then
      expect(outcome).toBe('failed');
      expect(client.embed).not.toHaveBeenCalled();
    });

    it('AI 서버가 설정되지 않았으면 disabled — DB도 읽지 않는다', async () => {
      // given
      client.enabled = false;

      // when
      const outcome = await service.refresh({ id: CONTENT_ID, title: '제목' });

      // then
      expect(outcome).toBe('disabled');
      expect(repository.findByContentId).not.toHaveBeenCalled();
    });
  });

  describe('backfill', () => {
    const targets = [
      { id: 'a', title: '첫 편' },
      { id: 'b', title: '둘째 편' },
      { id: 'c', title: '셋째 편' },
    ];

    it('유효한 행이 없는 편만 현행 모델로 찾아 차례로 채운다', async () => {
      // given
      repository.findContentsMissingTitleEmbedding.mockResolvedValueOnce(
        targets,
      );

      // when
      const result = await service.backfill({ delayMs: 0, limit: 10 });

      // then
      expect(repository.findContentsMissingTitleEmbedding).toHaveBeenCalledWith(
        EMBEDDING_MODEL_ID,
        {
          contentIds: undefined,
          limit: 10,
        },
      );
      expect(client.embed.mock.calls).toEqual([
        ['첫 편'],
        ['둘째 편'],
        ['셋째 편'],
      ]);
      expect(result).toEqual({ targets: 3, created: 3, failed: 0 });
    });

    it('다시 돌리면 대상이 없어 AI 서버를 부르지 않는다(멱등)', async () => {
      // given — 첫 실행이 다 채운 뒤에는 대상 조회가 빈 목록이다
      repository.findContentsMissingTitleEmbedding
        .mockResolvedValueOnce(targets)
        .mockResolvedValueOnce([]);
      await service.backfill({ delayMs: 0 });
      client.embed.mockClear();

      // when
      const second = await service.backfill({ delayMs: 0 });

      // then
      expect(second).toEqual({ targets: 0, created: 0, failed: 0 });
      expect(client.embed).not.toHaveBeenCalled();
      expect(repository.upsert).toHaveBeenCalledTimes(3);
    });

    it('한 편의 실패는 건너뛰고 나머지를 채운다', async () => {
      // given
      repository.findContentsMissingTitleEmbedding.mockResolvedValueOnce(
        targets,
      );
      client.embed
        .mockResolvedValueOnce(VECTOR)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('boom'));
      const progress: string[] = [];

      // when
      const result = await service.backfill({ delayMs: 0 }, (target, outcome) =>
        progress.push(`${target.id}:${outcome}`),
      );

      // then
      expect(result).toEqual({ targets: 3, created: 1, failed: 2 });
      expect(progress).toEqual(['a:created', 'b:failed', 'c:failed']);
    });

    it('dry-run은 대상만 세고 부르지 않는다', async () => {
      // given
      repository.findContentsMissingTitleEmbedding.mockResolvedValueOnce(
        targets,
      );

      // when
      const result = await service.backfill({ delayMs: 0, dryRun: true });

      // then
      expect(result).toEqual({ targets: 3, created: 0, failed: 0 });
      expect(client.embed).not.toHaveBeenCalled();
    });

    it('요청 사이에 delayMs를 쉰다(레이트 제한)', async () => {
      // given
      jest.useFakeTimers();
      repository.findContentsMissingTitleEmbedding.mockResolvedValueOnce(
        targets.slice(0, 2),
      );

      try {
        // when
        const running = service.backfill({ delayMs: 1_000 });
        await jest.advanceTimersByTimeAsync(0);

        // then — 첫 편만 불렸고, 1초가 지나야 둘째 편을 부른다
        expect(client.embed).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(1_000);
        await running;
        expect(client.embed).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
