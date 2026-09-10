import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

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

  /**
   * domain.md 3.2 — UPDATE 하지 않고 행을 추가한다. 철회도 `is_agreed: false` 행 추가다.
   *
   * 동의 이력은 법적 입증 자료라 **기록되는 버전은 서버가 정한다**(`CURRENT_CONSENT_VERSIONS`).
   * 클라이언트가 보낸 버전은 현행과 대조해 낡았으면 거부하고(가입 경로와 같은
   * `CONSENT_VERSION_STALE`), 비웠으면 현행 버전을 채운다. 같은 요청에 같은 종류가 두 번
   * 있으면 `agreed_at`이 동률이 되어 현재 상태 판정(아래 findCurrentStates)이 비결정이 되므로
   * 거부한다(2026-09-09 감사 — 종전엔 4.5 경로가 클라이언트 값을 그대로 기록했다).
   */
  async recordConsents(
    userId: string,
    inputs: ConsentInput[],
    agreedAt: Date,
    manager?: EntityManager,
  ): Promise<Consent[]> {
    const seenTypes = new Set<ConsentType>();
    for (const input of inputs) {
      if (seenTypes.has(input.consentType)) {
        throw new BusinessException({
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.VALIDATION_FAILED,
          message: '같은 동의 항목이 두 번 있어요',
          details: { field: 'consents' },
        });
      }
      seenTypes.add(input.consentType);

      const currentVersion = CURRENT_CONSENT_VERSIONS[input.consentType];
      if (input.version !== null && input.version !== currentVersion) {
        throw new BusinessException({
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.CONSENT_VERSION_STALE,
          message: '약관이 변경되었어요. 다시 확인해주세요',
        });
      }
    }

    const consents = inputs.map((input) =>
      this.consentRepository.create({
        userId,
        consentType: input.consentType,
        version: CURRENT_CONSENT_VERSIONS[input.consentType],
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
