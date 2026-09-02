import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { IdempotencyKey } from './idempotency-key.entity';
import { IdempotencyStatus } from './idempotency.enum';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyScope, IdempotencyService } from './idempotency.service';

const NOW = new Date('2026-08-05T09:00:00.000Z');

const SCOPE: IdempotencyScope = {
  ownerKey: 'user:11111111-1111-4111-8111-111111111111',
  idempotencyKey: 'key-1',
  endpoint: 'POST /api/v1/users/me/withdraw',
  requestHash: 'hash-1',
};

function buildKey(overrides: Partial<IdempotencyKey> = {}): IdempotencyKey {
  return {
    id: 'row-1',
    ownerKey: SCOPE.ownerKey,
    idempotencyKey: SCOPE.idempotencyKey,
    endpoint: SCOPE.endpoint,
    requestHash: SCOPE.requestHash,
    status: IdempotencyStatus.COMPLETED,
    responseStatus: 204,
    responseBody: null as string | null,
    expiresAt: new Date(NOW.getTime() + 3600_000),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repository: jest.Mocked<IdempotencyRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn(
        (value: Partial<IdempotencyKey>) => value as IdempotencyKey,
      ),
      insertIfAbsent: jest.fn(),
      findByScope: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      deleteById: jest.fn(),
      deleteByOwnerKey: jest.fn(),
      deleteExpired: jest.fn(),
    } as unknown as jest.Mocked<IdempotencyRepository>;

    service = new IdempotencyService(repository);
  });

  describe('begin', () => {
    it('처음 보는 키면 처리를 시작한다', async () => {
      // given
      repository.insertIfAbsent.mockResolvedValue(buildKey({ id: 'row-new' }));

      // when
      const outcome = await service.begin(SCOPE, NOW);

      // then
      expect(outcome).toEqual({ type: 'started', id: 'row-new' });
    });

    it('같은 키로 끝난 요청이 있으면 저장된 첫 응답을 그대로 돌려준다', async () => {
      // given
      repository.insertIfAbsent.mockResolvedValue(null);
      repository.findByScope.mockResolvedValue(
        buildKey({ responseStatus: 201, responseBody: '{"id":"user-1"}' }),
      );

      // when
      const outcome = await service.begin(SCOPE, NOW);

      // then
      // 저장한 원문 문자열이 그대로 돌아온다 (domain.md 1.4)
      expect(outcome).toEqual({
        type: 'replay',
        status: 201,
        body: '{"id":"user-1"}',
      });
    });

    it('같은 키에 다른 본문이 오면 거절한다', async () => {
      // given
      repository.insertIfAbsent.mockResolvedValue(null);
      repository.findByScope.mockResolvedValue(
        buildKey({ requestHash: 'hash-other' }),
      );

      // when
      const beginning = service.begin(SCOPE, NOW);

      // then
      await expect(beginning).rejects.toMatchObject({
        errorCode: ErrorCode.CONFLICT,
      });
    });

    it('아직 처리 중인 키로 다시 들어오면 거절한다', async () => {
      // given
      repository.insertIfAbsent.mockResolvedValue(null);
      repository.findByScope.mockResolvedValue(
        buildKey({
          status: IdempotencyStatus.IN_PROGRESS,
          responseStatus: null,
        }),
      );

      // when
      const beginning = service.begin(SCOPE, NOW);

      // then
      await expect(beginning).rejects.toMatchObject({
        errorCode: ErrorCode.CONFLICT,
      });
    });

    it('보존 기간이 지난 키는 지우고 처음 요청처럼 처리한다', async () => {
      // given
      repository.insertIfAbsent
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildKey({ id: 'row-new' }));
      repository.findByScope.mockResolvedValue(
        buildKey({ expiresAt: new Date(NOW.getTime() - 1000) }),
      );

      // when
      const outcome = await service.begin(SCOPE, NOW);

      // then
      expect(repository.deleteById).toHaveBeenCalledWith('row-1');
      expect(outcome).toEqual({ type: 'started', id: 'row-new' });
    });
  });

  describe('complete', () => {
    it('처리에 성공하면 응답을 저장해 다음 재요청에 돌려줄 수 있게 한다', async () => {
      // given
      const key = buildKey({
        status: IdempotencyStatus.IN_PROGRESS,
        responseStatus: null,
      });
      repository.findById.mockResolvedValue(key);

      // when
      await service.complete('row-1', 200, '{"ok":true}');

      // then
      expect(key.status).toBe(IdempotencyStatus.COMPLETED);
      expect(key.responseStatus).toBe(200);
      expect(key.responseBody).toBe('{"ok":true}');
    });

    it('탈퇴처럼 자기 스코프를 파기한 요청은 저장할 행이 없어도 실패하지 않는다', async () => {
      // given
      repository.findById.mockResolvedValue(null);

      // when
      const completing = service.complete('row-1', 204, null);

      // then
      await expect(completing).resolves.toBeUndefined();
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('discard', () => {
    it('처리에 실패하면 행을 남기지 않아 같은 키로 다시 시도할 수 있다', async () => {
      // given
      const id = 'row-1';

      // when
      await service.discard(id);

      // then
      expect(repository.deleteById).toHaveBeenCalledWith(id);
    });
  });
});
