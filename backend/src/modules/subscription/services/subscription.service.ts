import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { Subscription } from '../entities/subscription.entity';
import { SubscriptionRepository } from '../repositories/subscription.repository';

/**
 * `subscriptions`는 subscription 모듈 소유다(domain.md 2장).
 * 다른 모듈은 Repository를 직접 주입받지 않고 이 Service만 호출한다(architecture.md 4.3).
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
  ) {}

  /**
   * domain.md 12.3 — 결제 이력 판정 기준은 `subscriptions` 행의 존재 여부 하나다.
   * 무료(light)는 행이 생기지 않으므로, 행이 하나라도 있으면 결제 이력이 있는 것으로 본다.
   */
  async hasPaymentHistory(
    userId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.subscriptionRepository.existsByUserId(userId, manager);
  }

  /** 탈퇴 시 구독 만료 동의를 받아야 하는지 판정한다 (auth.md 4.3) */
  async hasLiveSubscription(
    userId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const count = await this.subscriptionRepository.countLiveByUserId(
      userId,
      manager,
    );
    return count > 0;
  }

  /**
   * 화면 표시용 현재 구독 — 없으면 `null`(무료 티어).
   *
   * **`users.tier` 캐시가 아니라 이 행이 진실의 원천이다**(domain.md 3.1 · 8.2).
   * 프로필·설정의 플랜 카드는 이 값으로 조립하고, 캐시 갱신은 이 모듈이 결제 반영 시점에
   * 한 곳에서만 수행한다 — 조회 경로가 캐시를 고치기 시작하면 갱신 지점이 흩어진다.
   */
  async findCurrent(
    userId: string,
    manager?: EntityManager,
  ): Promise<Subscription | null> {
    return this.subscriptionRepository.findLatestByUserId(userId, manager);
  }

  /** 탈퇴 아카이브 이관용 조회 (domain.md 12.3) */
  async findAllByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<Subscription[]> {
    return this.subscriptionRepository.findAllByUserId(userId, manager);
  }

  /** 탈퇴 파기. 아카이브 이관 뒤에 호출한다 */
  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.subscriptionRepository.deleteByUserId(userId, manager);
  }
}
