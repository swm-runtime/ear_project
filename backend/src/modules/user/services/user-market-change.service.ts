import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { toServiceDayRange } from '@/common/utils/service-date.util';
import { EnvironmentVariables } from '@/config/env.validation';

import { User } from '../entities/user.entity';
import { UserMarketChangeRepository } from '../repositories/user-market-change.repository';
import { UserRepository } from '../repositories/user.repository';
import { UserMarket } from '../user.enum';
import { UserOnboardingService } from './user-onboarding.service';

/** 전환을 지금 받을 수 있는지 — 미리보기와 전환이 같은 판정을 쓴다(`global-api.md` 4.11) */
export interface MarketChangeCooldown {
  /** 재온보딩을 끝내기 전에 직전 시장으로 되돌리는 것 — 하루 1회에서 뺀다 */
  isRevert: boolean;
  /** 막혔으면 다음 서비스 날짜(05:00 KST)까지 남은 초, 아니면 null */
  retryAfterSec: number | null;
}

/**
 * `users.market` 전환과 그 이력(`user_market_changes` — domain.md 3.4-1)을 소유한다(2026-10-19 — KAN-227).
 *
 * 시장은 가입 때 정하고, 그 뒤에는 **이 서비스로만** 바뀐다. 관심 주제·첫 드립처럼 다른 모듈이 가진 상태의 정리는
 * 위의 Orchestrator가 같은 트랜잭션으로 조합한다 — 여기서는 사용자 행(시장·온보딩)과 이력만 쓴다.
 */
@Injectable()
export class UserMarketChangeService {
  private readonly logger = new Logger(UserMarketChangeService.name);

  constructor(
    private readonly userMarketChangeRepository: UserMarketChangeRepository,
    private readonly userRepository: UserRepository,
    private readonly userOnboardingService: UserOnboardingService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * 서버 스위치 기준으로 그 시장으로 옮길 수 있는가 — 전환 스위치가 꺼져 있거나, GLOBAL인데 글로벌 가입이 닫혀 있으면 닫힘.
   * 가입이 닫힌 시장으로 전환만 열리면 출시 순서(주제 노출 → 콘텐츠 발행 → 스위치)가 새어 나간다. 노출 주제 판정은 호출부(주제 소유
   * 모듈)가 따로 한다.
   */
  isTargetOpen(target: UserMarket): boolean {
    if (!this.isSwitchOn('MARKET_CHANGE_ENABLED')) {
      return false;
    }

    return (
      target !== UserMarket.GLOBAL || this.isSwitchOn('GLOBAL_SIGNUP_ENABLED')
    );
  }

  /**
   * **서비스 날짜(05:00 KST)당 1회**(4.11 — 2026-10-19 결정). 악용 경로는 없지만 전환마다 관심 주제 초기화·첫 드립 재실행·지표
   * 이동이 일어난다.
   *
   * 예외: 재온보딩을 끝내기 전에 **직전 시장으로** 되돌리는 것은 세지 않는다 — 잘못 누른 사용자가 다음 날까지 온보딩에 갇혀
   * 드립·알림이 끊기지 않게. 되돌리기도 이력에 한 행을 남기고(`is_revert` — 무슨 일이 있었는지가 문의 대응의 근거다), 되돌리기를
   * 다시 되돌리는 것은 예외가 아니다.
   */
  async judgeCooldown(
    user: User,
    target: UserMarket,
    now: Date,
    manager?: EntityManager,
  ): Promise<MarketChangeCooldown> {
    const latest = await this.userMarketChangeRepository.findLatestByUserId(
      user.id,
      manager,
    );
    // 직전 행이 이미 되돌리기면 다시 되돌리기로 보지 않는다 — 온보딩 중 무한 왕복을 막는다
    const isRevert =
      latest !== null &&
      !latest.isRevert &&
      latest.toMarket === user.market &&
      latest.fromMarket === target &&
      !user.onboardingCompleted;

    if (isRevert) {
      return { isRevert, retryAfterSec: null };
    }

    const { start, end } = toServiceDayRange(now);
    const changedToday =
      await this.userMarketChangeRepository.countNonRevertByUserIdSince(
        user.id,
        start,
        manager,
      );

    return {
      isRevert,
      retryAfterSec:
        changedToday > 0
          ? Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000))
          : null,
    };
  }

  assertNoCooldown(cooldown: MarketChangeCooldown): void {
    if (cooldown.retryAfterSec !== null) {
      throw new BusinessException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: ErrorCode.MARKET_CHANGE_COOLDOWN,
        message: '콘텐츠 언어는 하루에 한 번만 바꿀 수 있어요',
        retryAfterSec: cooldown.retryAfterSec,
        logLevel: 'info',
      });
    }
  }

  /**
   * 시장을 바꾸고 온보딩을 주제 단계로 되돌린 뒤 이력을 남긴다. `user`는 같은 트랜잭션에서 잠가 읽은 인스턴스여야 한다
   * (`UserOnboardingService.getUserForUpdate`와 같은 이유 — 낡은 엔티티의 save는 동시 변경을 되돌린다).
   */
  async apply(
    user: User,
    target: UserMarket,
    isRevert: boolean,
    now: Date,
    manager: EntityManager,
  ): Promise<User> {
    const from = user.market;

    await this.userMarketChangeRepository.save(
      this.userMarketChangeRepository.create({
        userId: user.id,
        fromMarket: from,
        toMarket: target,
        isRevert,
        changedAt: now,
      }),
      manager,
    );

    user.market = target;
    this.userOnboardingService.restartForMarketChange(user);
    const saved = await this.userRepository.save(user, manager);

    this.logger.log('user market changed', {
      user_id: user.id,
      from_market: from,
      to_market: target,
      is_revert: isRevert,
    });

    return saved;
  }

  private isSwitchOn(
    key: 'MARKET_CHANGE_ENABLED' | 'GLOBAL_SIGNUP_ENABLED',
  ): boolean {
    return this.configService.get(key, { infer: true })?.trim() === 'true';
  }
}
