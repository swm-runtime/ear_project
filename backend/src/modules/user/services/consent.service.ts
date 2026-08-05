import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { ConsentRepository } from '../repositories/consent.repository';
import { Consent } from '../entities/consent.entity';
import {
  CURRENT_CONSENT_VERSIONS,
  REQUIRED_CONSENT_TYPES,
} from '../user.constant';
import { ConsentType } from '../user.enum';
import { ConsentInput, ConsentState, PendingConsent } from '../user.types';

@Injectable()
export class ConsentService {
  constructor(private readonly consentRepository: ConsentRepository) {}

  /** domain.md 3.2 — UPDATE 하지 않고 행을 추가한다. 철회도 `is_agreed: false` 행 추가다 */
  async recordConsents(
    userId: string,
    inputs: ConsentInput[],
    agreedAt: Date,
    manager?: EntityManager,
  ): Promise<Consent[]> {
    const consents = inputs.map((input) =>
      this.consentRepository.create({
        userId,
        consentType: input.consentType,
        version: input.version,
        isAgreed: input.isAgreed,
        agreedAt,
      }),
    );

    return this.consentRepository.saveAll(consents, manager);
  }

  /** 현재 동의 상태 = `consent_type`별 `agreed_at` 최신 1건 (domain.md 3.2) */
  async findCurrentStates(
    userId: string,
    manager?: EntityManager,
  ): Promise<ConsentState[]> {
    const consents = await this.consentRepository.findAllByUserId(
      userId,
      manager,
    );
    const latestByType = new Map<ConsentType, Consent>();

    for (const consent of consents) {
      const current = latestByType.get(consent.consentType);
      if (!current || current.agreedAt < consent.agreedAt) {
        latestByType.set(consent.consentType, consent);
      }
    }

    return [...latestByType.values()].map((consent) => ({
      consentType: consent.consentType,
      version: consent.version,
      isAgreed: consent.isAgreed,
      agreedAt: consent.agreedAt,
    }));
  }

  /**
   * auth-api.md 4.1 — 재동의 판정은 서버가 `consents` 최신 버전과 현행 버전을 비교해서 한다.
   * 클라이언트가 보낸 버전을 신뢰하지 않는다.
   */
  async findPendingConsents(
    userId: string,
    manager?: EntityManager,
  ): Promise<PendingConsent[]> {
    const states = await this.findCurrentStates(userId, manager);
    const stateByType = new Map(
      states.map((state) => [state.consentType, state]),
    );

    return REQUIRED_CONSENT_TYPES.filter((consentType) => {
      const state = stateByType.get(consentType);
      return (
        !state?.isAgreed ||
        state.version !== CURRENT_CONSENT_VERSIONS[consentType]
      );
    }).map((consentType) => ({
      consentType,
      version: CURRENT_CONSENT_VERSIONS[consentType],
      isRequired: true,
    }));
  }

  async findAllByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<Consent[]> {
    return this.consentRepository.findAllByUserId(userId, manager);
  }

  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.consentRepository.deleteByUserId(userId, manager);
  }
}
