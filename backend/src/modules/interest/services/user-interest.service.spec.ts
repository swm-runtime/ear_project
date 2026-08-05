import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { TopicService } from './topic.service';
import { UserInterestService } from './user-interest.service';
import { UserInterest } from '../entities/user-interest.entity';
import { UserInterestSource } from '../interest.enum';
import { UserInterestRepository } from '../repositories/user-interest.repository';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_B = 'bbbbbbbb-1111-4111-8111-111111111111';
const TOPIC_C = 'cccccccc-1111-4111-8111-111111111111';
const TOPIC_D = 'dddddddd-1111-4111-8111-111111111111';

function buildInterest(overrides: Partial<UserInterest> = {}): UserInterest {
  return {
    id: 'row-1',
    userId: USER_ID,
    topicId: TOPIC_A,
    source: UserInterestSource.ONBOARDING,
    isActive: true,
    isUserRemoved: false,
    deactivatedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as UserInterest;
}

async function expectErrorCode(
  run: () => Promise<unknown>,
  errorCode: ErrorCode,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({ errorCode });
  await expect(run()).rejects.toBeInstanceOf(BusinessException);
}

describe('UserInterestService', () => {
  let service: UserInterestService;
  let repository: jest.Mocked<UserInterestRepository>;
  let topicService: jest.Mocked<TopicService>;

  beforeEach(() => {
    repository = {
      findAllByUserId: jest.fn().mockResolvedValue([]),
      findAllActiveByUserId: jest.fn().mockResolvedValue([]),
      saveAll: jest.fn().mockImplementation((rows: UserInterest[]) => rows),
      create: jest.fn((value: Partial<UserInterest>) => value as UserInterest),
      deleteByUserId: jest.fn(),
    } as unknown as jest.Mocked<UserInterestRepository>;

    topicService = {
      findUnavailableTopicIds: jest.fn().mockResolvedValue([]),
      getSelectableTopics: jest.fn(),
      findAllByIds: jest.fn(),
    } as unknown as jest.Mocked<TopicService>;

    service = new UserInterestService(repository, topicService);
  });

  describe('replaceOnboardingSelection', () => {
    it('주제를 하나도 보내지 않으면 거부한다', async () => {
      // given / when / then — 1단계는 건너뛸 수 없다
      await expectErrorCode(
        () => service.replaceOnboardingSelection(USER_ID, [], NOW),
        ErrorCode.ONBOARDING_INTEREST_REQUIRED,
      );
      expect(repository.saveAll).not.toHaveBeenCalled();
    });

    it('클라이언트를 우회해 주제 4개를 보내면 서버가 상한을 검증해 거부한다', async () => {
      // given / when / then
      await expectErrorCode(
        () =>
          service.replaceOnboardingSelection(
            USER_ID,
            [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D],
            NOW,
          ),
        ErrorCode.ONBOARDING_INTEREST_LIMIT_EXCEEDED,
      );
    });

    it('상한을 넘겨도 초과분을 잘라내 저장하지 않는다', async () => {
      // given / when
      await service
        .replaceOnboardingSelection(
          USER_ID,
          [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D],
          NOW,
        )
        .catch(() => undefined);

      // then — 화면에 그려진 선택과 서버 상태가 어긋나면 안 된다
      expect(repository.saveAll).not.toHaveBeenCalled();
    });

    it('같은 주제를 두 번 보내면 거부한다', async () => {
      // given / when / then
      await expectErrorCode(
        () =>
          service.replaceOnboardingSelection(USER_ID, [TOPIC_A, TOPIC_A], NOW),
        ErrorCode.VALIDATION_FAILED,
      );
    });

    it('노출되지 않는 주제가 섞여 있으면 거부한다', async () => {
      // given
      topicService.findUnavailableTopicIds.mockResolvedValue([TOPIC_B]);

      // when / then
      await expectErrorCode(
        () =>
          service.replaceOnboardingSelection(USER_ID, [TOPIC_A, TOPIC_B], NOW),
        ErrorCode.ONBOARDING_TOPIC_UNAVAILABLE,
      );
    });

    it('선택한 주제를 저장하고 선택 목록을 돌려준다', async () => {
      // given / when
      const saved = await service.replaceOnboardingSelection(
        USER_ID,
        [TOPIC_A, TOPIC_B],
        NOW,
      );

      // then
      expect(saved).toEqual([TOPIC_A, TOPIC_B]);
      const rows = repository.saveAll.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.isActive)).toBe(true);
      expect(
        rows.every((row) => row.source === UserInterestSource.ONBOARDING),
      ).toBe(true);
    });

    it('이번 선택에서 빠진 기존 주제는 삭제하지 않고 비활성으로 내린다', async () => {
      // given
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({ id: 'row-2', topicId: TOPIC_B }),
      ]);

      // when
      await service.replaceOnboardingSelection(USER_ID, [TOPIC_A], NOW);

      // then
      const rows = repository.saveAll.mock.calls[0][0];
      const dropped = rows.find((row) => row.topicId === TOPIC_B);
      expect(dropped?.isActive).toBe(false);
      expect(dropped?.deactivatedAt).toEqual(NOW);
    });

    it('다시 선택한 주제는 새 행을 만들지 않고 기존 행을 되살린다', async () => {
      // given — 자동 확장 제외 플래그가 지워지면 안 된다
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({
          topicId: TOPIC_A,
          isActive: false,
          isUserRemoved: true,
          deactivatedAt: NOW,
        }),
      ]);

      // when
      await service.replaceOnboardingSelection(USER_ID, [TOPIC_A], NOW);

      // then
      const rows = repository.saveAll.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('row-1');
      expect(rows[0].isActive).toBe(true);
      expect(rows[0].deactivatedAt).toBeNull();
      expect(rows[0].isUserRemoved).toBe(true);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });
});
