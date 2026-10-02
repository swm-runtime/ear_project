import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { PurchaseIntent } from '../entities/purchase-intent.entity';
import {
  PurchaseIntentDraft,
  PurchaseIntentRepository,
} from '../repositories/purchase-intent.repository';
import { PURCHASE_INTENT_RETENTION_DAYS } from '../subscription.constant';
import { PurchaseIntentStatus } from '../subscription.enum';

/**
 * `purchase_intents`(domain.md 8.3) — 결제 전 서버 관문의 기록이자 **계정 결속 토큰**이다.
 * 행의 `id`를 결제에 실어 보내면 스토어가 서명한 거래 안에 담겨 돌아와, 그 거래를 시작한 계정을 확인한다.
 */
@Injectable()
export class PurchaseIntentService {
  constructor(
    private readonly purchaseIntentRepository: PurchaseIntentRepository,
  ) {}

  async create(
    draft: PurchaseIntentDraft,
    manager?: EntityManager,
  ): Promise<PurchaseIntent> {
    return this.purchaseIntentRepository.create(draft, manager);
  }

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<PurchaseIntent | null> {
    return this.purchaseIntentRepository.findById(id, manager);
  }

  /** 영수증 검증이 이 의도와 맞물렸다는 기록 */
  async markVerified(id: string, manager?: EntityManager): Promise<void> {
    await this.purchaseIntentRepository.updateStatus(
      id,
      PurchaseIntentStatus.VERIFIED,
      manager,
    );
  }

  /** 결제 시트를 닫아 `created`로 남은 행을 30일 뒤 정리한다(domain.md 8.3) */
  async purgeAbandoned(now: Date): Promise<number> {
    const before = new Date(
      now.getTime() - PURCHASE_INTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    return this.purchaseIntentRepository.deleteCreatedBefore(before);
  }
}
