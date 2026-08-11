import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { TopicService } from './topic.service';
import { UserInterestService } from './user-interest.service';
import { Topic } from '../entities/topic.entity';
import { UserInterest } from '../entities/user-interest.entity';
import { UserInterestSource } from '../interest.enum';
import { UserInterestRepository } from '../repositories/user-interest.repository';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_B = 'bbbbbbbb-1111-4111-8111-111111111111';
const TOPIC_C = 'cccccccc-1111-4111-8111-111111111111';
const TOPIC_D = 'dddddddd-1111-4111-8111-111111111111';
const TOPIC_E = 'eeeeeeee-1111-4111-8111-111111111111';
const TOPIC_F = 'ffffffff-1111-4111-8111-111111111111';

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

function buildTopic(id: string, isVisible = true): Topic {
  return { id, isVisible, name: `topic-${id.slice(0, 8)}` } as Topic;
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
      // 기본값: 조회한 주제는 전부 노출 중이다. 숨김 시나리오는 개별 테스트가 덮어쓴다
      findAllByIds: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(ids.map((id) => buildTopic(id))),
        ),
    } as unknown as jest.Mocked<TopicService>;

    const dataSource = {
      transaction: jest.fn(
        (run: (manager: EntityManager) => Promise<unknown>) =>
          run({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new UserInterestService(repository, topicService, dataSource);
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

  describe('findAllActive', () => {
    it('숨겨진 주제의 활성 관심사는 모든 소비처에서 걸러진다', async () => {
      // given — 팀 결정 2026-08-11: 숨김 주제는 보유 여부와 무관하게 제거된다
      repository.findAllActiveByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({ id: 'row-2', topicId: TOPIC_B }),
      ]);
      topicService.findAllByIds.mockResolvedValue([
        buildTopic(TOPIC_A),
        buildTopic(TOPIC_B, false),
      ]);

      // when
      const active = await service.findAllActive(USER_ID);

      // then
      expect(active).toHaveLength(1);
      expect(active[0].topicId).toBe(TOPIC_A);
    });
  });

  describe('buildSummary', () => {
    it('숨겨진 주제는 요약 개수와 대표 주제에서 제외한다', async () => {
      // given — 편집 화면의 N/3과 같은 기준을 쓴다(프로필 3개 ↔ 편집 2/3 어긋남 방지)
      repository.findAllActiveByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({ id: 'row-2', topicId: TOPIC_B }),
        buildInterest({ id: 'row-3', topicId: TOPIC_C }),
      ]);
      topicService.findAllByIds.mockImplementation((ids: string[]) =>
        Promise.resolve(ids.map((id) => buildTopic(id, id !== TOPIC_B))),
      );

      // when
      const summary = await service.buildSummary(USER_ID, 3);

      // then
      expect(summary.count).toBe(2);
      expect(summary.topTopics.map((topic) => topic.id)).toEqual([
        TOPIC_A,
        TOPIC_C,
      ]);
    });
  });

  describe('findEditableSelection', () => {
    it('숨겨진 주제의 활성 관심사는 응답에서 제외한다', async () => {
      // given — TOPIC_B가 관리자에 의해 숨겨졌다
      repository.findAllActiveByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({ id: 'row-2', topicId: TOPIC_B }),
      ]);
      topicService.findAllByIds.mockResolvedValue([
        buildTopic(TOPIC_A),
        buildTopic(TOPIC_B, false),
      ]);

      // when
      const selection = await service.findEditableSelection(USER_ID);

      // then — 행 자체는 남아 있지만 칩으로 그릴 수 없는 선택지는 내려주지 않는다
      expect(selection).toEqual([
        { topicId: TOPIC_A, source: UserInterestSource.ONBOARDING },
      ]);
    });

    it('활성 관심사가 노출 주제에 하나도 없으면 빈 배열을 돌려준다', async () => {
      // given
      repository.findAllActiveByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
      ]);
      topicService.findAllByIds.mockResolvedValue([buildTopic(TOPIC_A, false)]);

      // when / then — 404가 아니다. 화면은 0개 상태로 동작해야 한다
      await expect(service.findEditableSelection(USER_ID)).resolves.toEqual([]);
    });
  });

  describe('replaceManagedSelection', () => {
    it('주제를 하나도 보내지 않으면 거부한다', async () => {
      // given / when / then — 0개 저장은 클라이언트가 막지만 서버도 방어한다
      await expectErrorCode(
        () => service.replaceManagedSelection(USER_ID, [], NOW),
        ErrorCode.INTEREST_REQUIRED,
      );
      expect(repository.saveAll).not.toHaveBeenCalled();
    });

    it('같은 주제를 두 번 보내면 거부한다', async () => {
      // given / when / then
      await expectErrorCode(
        () => service.replaceManagedSelection(USER_ID, [TOPIC_A, TOPIC_A], NOW),
        ErrorCode.VALIDATION_FAILED,
      );
    });

    it('존재하지 않거나 숨겨진 주제가 섞여 있으면 거부한다', async () => {
      // given
      topicService.findUnavailableTopicIds.mockResolvedValue([TOPIC_B]);

      // when / then — 없는 주제와 숨겨진 주제를 같은 코드로 응답한다(탐침 방지)
      await expectErrorCode(
        () => service.replaceManagedSelection(USER_ID, [TOPIC_A, TOPIC_B], NOW),
        ErrorCode.INTEREST_TOPIC_UNAVAILABLE,
      );
    });

    it('클라이언트를 우회해 주제 4개를 보내면 서버가 상한을 검증해 거부한다', async () => {
      // given — 기존 3개 보유
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({ id: 'row-2', topicId: TOPIC_B }),
        buildInterest({ id: 'row-3', topicId: TOPIC_C }),
      ]);

      // when / then — 초과분을 잘라내고 성공시키지 않는다
      await expectErrorCode(
        () =>
          service.replaceManagedSelection(
            USER_ID,
            [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D],
            NOW,
          ),
        ErrorCode.INTEREST_LIMIT_EXCEEDED,
      );
      expect(repository.saveAll).not.toHaveBeenCalled();
    });

    it('상한을 넘게 보유한 사용자의 같은 개수 재저장은 통과한다', async () => {
      // given — 상한 도입 이전 가입자가 5개를 보유한 상태 (interest-management.md 7장)
      const topicIds = [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D, TOPIC_E];
      repository.findAllByUserId.mockResolvedValue(
        topicIds.map((topicId, index) =>
          buildInterest({ id: `row-${index}`, topicId }),
        ),
      );

      // when / then — 강제 축소를 요구하지 않는다. 변경 없음 재저장도 허용된다
      await expect(
        service.replaceManagedSelection(USER_ID, topicIds, NOW),
      ).resolves.toHaveLength(5);
    });

    it('상한을 넘게 보유한 사용자도 개수를 늘리는 저장은 거부한다', async () => {
      // given — 5개 보유에서 6개로
      repository.findAllByUserId.mockResolvedValue(
        [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D, TOPIC_E].map((topicId, index) =>
          buildInterest({ id: `row-${index}`, topicId }),
        ),
      );

      // when / then
      await expectErrorCode(
        () =>
          service.replaceManagedSelection(
            USER_ID,
            [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D, TOPIC_E, TOPIC_F],
            NOW,
          ),
        ErrorCode.INTEREST_LIMIT_EXCEEDED,
      );
    });

    it('상한을 넘게 보유한 사용자가 개수를 줄이는 저장은 통과한다', async () => {
      // given — 5개 → 4개
      repository.findAllByUserId.mockResolvedValue(
        [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D, TOPIC_E].map((topicId, index) =>
          buildInterest({ id: `row-${index}`, topicId }),
        ),
      );

      // when
      const result = await service.replaceManagedSelection(
        USER_ID,
        [TOPIC_A, TOPIC_B, TOPIC_C, TOPIC_D],
        NOW,
      );

      // then
      expect(result).toHaveLength(4);
      const rows = repository.saveAll.mock.calls[0][0];
      const dropped = rows.find((row) => row.topicId === TOPIC_E);
      expect(dropped?.isActive).toBe(false);
    });

    it('해제한 주제는 삭제하지 않고 직접 해제 표시와 함께 내린다', async () => {
      // given
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({ id: 'row-2', topicId: TOPIC_B }),
      ]);

      // when
      await service.replaceManagedSelection(USER_ID, [TOPIC_A], NOW);

      // then — 자동 확장이 같은 주제를 다시 넣지 않도록 is_user_removed를 세운다
      const rows = repository.saveAll.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0].topicId).toBe(TOPIC_B);
      expect(rows[0].isActive).toBe(false);
      expect(rows[0].isUserRemoved).toBe(true);
      expect(rows[0].deactivatedAt).toEqual(NOW);
    });

    it('해제했던 주제를 다시 추가하면 새 행 없이 기존 행을 복원한다', async () => {
      // given — 과거에 직접 해제했던 주제
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({
          id: 'row-2',
          topicId: TOPIC_B,
          isActive: false,
          isUserRemoved: true,
          deactivatedAt: NOW,
        }),
      ]);

      // when
      const result = await service.replaceManagedSelection(
        USER_ID,
        [TOPIC_A, TOPIC_B],
        NOW,
      );

      // then — is_user_removed를 되돌려 편성이 재개된다 (interest-management.md 7장)
      const rows = repository.saveAll.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('row-2');
      expect(rows[0].isActive).toBe(true);
      expect(rows[0].isUserRemoved).toBe(false);
      expect(rows[0].deactivatedAt).toBeNull();
      expect(rows[0].source).toBe(UserInterestSource.MANUAL);
      expect(repository.create).not.toHaveBeenCalled();
      expect(result).toContainEqual({
        topicId: TOPIC_B,
        source: UserInterestSource.MANUAL,
      });
    });

    it('유지한 주제의 source는 덮지 않는다', async () => {
      // given — 자동 확장으로 들어온 주제를 해제하지 않고 다른 주제만 추가한다
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({
          topicId: TOPIC_A,
          source: UserInterestSource.AUTO_EXPAND,
        }),
      ]);

      // when
      const result = await service.replaceManagedSelection(
        USER_ID,
        [TOPIC_A, TOPIC_B],
        NOW,
      );

      // then — 저장 대상은 추가분뿐이고, 유지분은 원값 그대로 응답에 실린다
      const rows = repository.saveAll.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0].topicId).toBe(TOPIC_B);
      expect(rows[0].source).toBe(UserInterestSource.MANUAL);
      expect(result).toContainEqual({
        topicId: TOPIC_A,
        source: UserInterestSource.AUTO_EXPAND,
      });
    });

    it('숨겨진 주제의 활성 관심사는 요청 목록에 없어도 해제하지 않는다', async () => {
      // given — TOPIC_B가 숨겨져 화면이 목록에 담을 수 없는 상태
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({ id: 'row-2', topicId: TOPIC_B }),
      ]);
      topicService.findAllByIds.mockResolvedValue([
        buildTopic(TOPIC_A),
        buildTopic(TOPIC_B, false),
      ]);

      // when — 사용자는 보이는 TOPIC_A에 TOPIC_C를 더해 저장한다
      await service.replaceManagedSelection(USER_ID, [TOPIC_A, TOPIC_C], NOW);

      // then — 사용자가 하지 않은 해제가 기록되면 안 된다. 저장 대상은 추가분뿐이다
      const rows = repository.saveAll.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0].topicId).toBe(TOPIC_C);
    });

    it('숨겨진 주제는 상한 판정의 개수에서도 제외한다', async () => {
      // given — 활성 4개 중 2개가 숨겨져 화면에는 2개만 보인다
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({ id: 'row-2', topicId: TOPIC_B }),
        buildInterest({ id: 'row-3', topicId: TOPIC_C }),
        buildInterest({ id: 'row-4', topicId: TOPIC_D }),
      ]);
      topicService.findAllByIds.mockResolvedValue([
        buildTopic(TOPIC_A),
        buildTopic(TOPIC_B),
        buildTopic(TOPIC_C, false),
        buildTopic(TOPIC_D, false),
      ]);

      // when / then — 분모가 2이므로 상한은 max(3, 2) = 3이고, 4개 저장은 거부된다
      await expectErrorCode(
        () =>
          service.replaceManagedSelection(
            USER_ID,
            [TOPIC_A, TOPIC_B, TOPIC_E, TOPIC_F],
            NOW,
          ),
        ErrorCode.INTEREST_LIMIT_EXCEEDED,
      );
    });

    it('변경 없음 요청도 저장 없이 성공한다', async () => {
      // given — 재시도·복수 기기에서 같은 목록이 도착할 수 있다(전체 교체는 멱등)
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
        buildInterest({ id: 'row-2', topicId: TOPIC_B }),
      ]);

      // when
      const result = await service.replaceManagedSelection(
        USER_ID,
        [TOPIC_A, TOPIC_B],
        NOW,
      );

      // then
      expect(repository.saveAll).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('새로 추가한 주제는 manual 출처의 활성 행으로 저장한다', async () => {
      // given
      repository.findAllByUserId.mockResolvedValue([
        buildInterest({ topicId: TOPIC_A }),
      ]);

      // when
      await service.replaceManagedSelection(USER_ID, [TOPIC_A, TOPIC_B], NOW);

      // then
      const rows = repository.saveAll.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: USER_ID,
        topicId: TOPIC_B,
        source: UserInterestSource.MANUAL,
        isActive: true,
        isUserRemoved: false,
      });
    });
  });
});
