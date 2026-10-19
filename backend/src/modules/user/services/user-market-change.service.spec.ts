import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { toServiceDayRange } from '@/common/utils/service-date.util';

import { User } from '../entities/user.entity';
import { UserMarketChange } from '../entities/user-market-change.entity';
import { UserMarketChangeRepository } from '../repositories/user-market-change.repository';
import { UserRepository } from '../repositories/user.repository';
import { OnboardingStep, UserMarket } from '../user.enum';
import { UserMarketChangeService } from './user-market-change.service';
import { UserOnboardingService } from './user-onboarding.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-19T03:00:00.000Z');
const manager = {} as never;

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    market: UserMarket.KR,
    onboardingCompleted: true,
    onboardingStep: OnboardingStep.DONE,
    ...overrides,
  } as User;
}

describe('UserMarketChangeService', () => {
  let service: UserMarketChangeService;
  let repository: jest.Mocked<UserMarketChangeRepository>;
  let userRepository: jest.Mocked<UserRepository>;
  let env: Record<string, string>;

  beforeEach(() => {
    repository = {
      findLatestByUserId: jest.fn().mockResolvedValue(null),
      countByUserIdSince: jest.fn().mockResolvedValue(0),
      create: jest.fn((value: Partial<UserMarketChange>) => value),
      save: jest.fn((value: UserMarketChange) => Promise.resolve(value)),
    } as unknown as jest.Mocked<UserMarketChangeRepository>;
    userRepository = {
      save: jest.fn((user: User) => Promise.resolve(user)),
    } as unknown as jest.Mocked<UserRepository>;
    env = { MARKET_CHANGE_ENABLED: 'true', GLOBAL_SIGNUP_ENABLED: 'true' };

    service = new UserMarketChangeService(
      repository,
      userRepository,
      new UserOnboardingService(userRepository, {} as never),
      { get: (key: string) => env[key] } as unknown as ConfigService<
        never,
        true
      >,
    );
  });

  describe('isTargetOpen', () => {
    it('전환 스위치가 꺼져 있으면 어느 시장으로도 닫혀 있다', () => {
      env.MARKET_CHANGE_ENABLED = '';

      expect(service.isTargetOpen(UserMarket.KR)).toBe(false);
      expect(service.isTargetOpen(UserMarket.GLOBAL)).toBe(false);
    });

    it('GLOBAL은 글로벌 가입 스위치도 따른다 — 가입이 닫힌 시장으로 전환만 열리지 않게', () => {
      env.GLOBAL_SIGNUP_ENABLED = 'false';

      expect(service.isTargetOpen(UserMarket.GLOBAL)).toBe(false);
      expect(service.isTargetOpen(UserMarket.KR)).toBe(true);
    });
  });

  describe('judgeCooldown — 서비스 날짜당 1회', () => {
    it('오늘 바꾼 적이 없으면 통과한다', async () => {
      // when
      const cooldown = await service.judgeCooldown(
        buildUser(),
        UserMarket.GLOBAL,
        NOW,
      );

      // then
      expect(cooldown).toEqual({ isRevert: false, retryAfterSec: null });
      expect(repository.countByUserIdSince).toHaveBeenCalledWith(
        USER_ID,
        toServiceDayRange(NOW).start,
        undefined,
      );
    });

    it('오늘 이미 바꿨으면 다음 서비스 날짜 시작까지 남은 초를 준다', async () => {
      // given — 오늘 GLOBAL로 옮겨 재온보딩을 마쳤고, 다시 KR로 가려 한다
      repository.findLatestByUserId.mockResolvedValue({
        fromMarket: UserMarket.KR,
        toMarket: UserMarket.GLOBAL,
        isRevert: false,
      } as UserMarketChange);
      repository.countByUserIdSince.mockResolvedValue(1);

      // when
      const cooldown = await service.judgeCooldown(
        buildUser({ market: UserMarket.GLOBAL, onboardingCompleted: true }),
        UserMarket.KR,
        NOW,
      );

      // then
      expect(cooldown).toEqual({
        isRevert: false,
        retryAfterSec: Math.ceil(
          (toServiceDayRange(NOW).end.getTime() - NOW.getTime()) / 1000,
        ),
      });
      let thrown: unknown;
      try {
        service.assertNoCooldown(cooldown);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        errorCode: ErrorCode.MARKET_CHANGE_COOLDOWN,
        retryable: false,
        retryAfterSec: cooldown.retryAfterSec,
      });
    });

    it('재온보딩을 끝내기 전에 직전 시장으로 되돌리는 것은 세지 않는다 — 잘못 누른 사용자가 갇히지 않게', async () => {
      // given
      repository.findLatestByUserId.mockResolvedValue({
        fromMarket: UserMarket.KR,
        toMarket: UserMarket.GLOBAL,
        isRevert: false,
      } as UserMarketChange);
      repository.countByUserIdSince.mockResolvedValue(1);

      // when
      const cooldown = await service.judgeCooldown(
        buildUser({ market: UserMarket.GLOBAL, onboardingCompleted: false }),
        UserMarket.KR,
        NOW,
      );

      // then
      expect(cooldown).toEqual({ isRevert: true, retryAfterSec: null });
    });
  });

  it('되돌리기를 다시 되돌리는 것은 예외가 아니다 — 온보딩 중 무한 왕복을 막는다', async () => {
    // given — KR→GLOBAL(셈) 뒤 GLOBAL→KR(되돌리기). 다시 GLOBAL로 가려 한다
    repository.findLatestByUserId.mockResolvedValue({
      fromMarket: UserMarket.GLOBAL,
      toMarket: UserMarket.KR,
      isRevert: true,
    } as UserMarketChange);
    repository.countByUserIdSince.mockResolvedValue(2);

    // when
    const cooldown = await service.judgeCooldown(
      buildUser({ market: UserMarket.KR, onboardingCompleted: false }),
      UserMarket.GLOBAL,
      NOW,
    );

    // then
    expect(cooldown.isRevert).toBe(false);
    expect(cooldown.retryAfterSec).not.toBeNull();
  });

  describe('apply', () => {
    it('시장을 바꾸고 온보딩을 주제 단계로 되돌린 뒤 이력을 남긴다', async () => {
      // when
      const saved = await service.apply(
        buildUser(),
        UserMarket.GLOBAL,
        false,
        NOW,
        manager,
      );

      // then
      expect(saved).toMatchObject({
        market: UserMarket.GLOBAL,
        onboardingCompleted: false,
        onboardingStep: OnboardingStep.TOPIC,
      });
      expect(repository.save).toHaveBeenCalledWith(
        {
          userId: USER_ID,
          fromMarket: UserMarket.KR,
          toMarket: UserMarket.GLOBAL,
          isRevert: false,
          changedAt: NOW,
        },
        manager,
      );
    });
  });
});
