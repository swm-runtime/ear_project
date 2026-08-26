import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { DripExclusionReason } from '../drip.enum';
import { DripExcludedContentRepository } from '../repositories/drip-excluded-content.repository';

/**
 * `drip_excluded_contents`는 drip 모듈 소유다(domain.md 2장).
 * 라이브러리 삭제·재생 시작처럼 **다른 모듈이 영구 제외를 적재해야 하는 경로**가 있어
 * Repository 대신 이 Service를 공개한다(architecture.md 4.3).
 */
@Injectable()
export class DripExclusionService {
  constructor(
    private readonly dripExcludedContentRepository: DripExcludedContentRepository,
  ) {}

  /**
   * 드립 재적립 대상에서 **영구 제외**한다(FR-16).
   *
   * **이미 행이 있으면 최초 사유를 유지한다**(domain.md 7.1). `reason`은 필터 조건이 아니라
   * 운영·디버깅용이며, 나중에 들어온 사유로 덮으면 "왜 제외됐는지"의 최초 근거가 사라진다.
   *
   * 삭제 경로(라이브러리 삭제 / 탐색 담기 해제)를 구분하지 않는 것도 같은 이유다 —
   * 어느 쪽이든 결과가 같은 영구 제외다(`library.md` 4.5).
   */
  async exclude(
    userId: string,
    contentId: string,
    reason: DripExclusionReason,
    now: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.dripExcludedContentRepository.insertIgnoringConflicts(
      [{ userId, contentId, reason, excludedAt: now }],
      manager,
    );
  }

  /** 후보 필터(FR-16)의 제외 목록 절반 — 나머지 절반(`library_items`)은 library가 소유한다 */
  async findExcludedContentIds(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    return this.dripExcludedContentRepository.findAllContentIdsByUserId(
      userId,
      manager,
    );
  }
}
