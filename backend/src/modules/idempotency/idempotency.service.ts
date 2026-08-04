import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessConflictException } from '@/common/exceptions/business-conflict.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { IDEMPOTENCY_RETENTION_SEC } from './idempotency.constant';
import { IdempotencyStatus } from './idempotency.enum';
import { IdempotencyRepository } from './idempotency.repository';

export interface IdempotencyScope {
  ownerKey: string;
  idempotencyKey: string;
  endpoint: string;
  requestHash: string;
}

export type IdempotencyOutcome =
  /** 이 요청이 처음이다. 핸들러를 실행하고 결과를 `complete`로 기록한다 */
  | { type: 'started'; id: string }
  /** 같은 키로 이미 끝난 요청이다. 저장된 첫 응답 **원문**을 그대로 돌려준다 */
  | { type: 'replay'; status: number; body: string | null };

/**
 * domain.md 1.4 / architecture.md 8.4 — 중복 실행 방어.
 * 판정은 애플리케이션이 하고 최종 방어는 유니크 제약이 한다.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly idempotencyRepository: IdempotencyRepository) {}

  async begin(scope: IdempotencyScope, now: Date): Promise<IdempotencyOutcome> {
    const created = await this.idempotencyRepository.insertIfAbsent(
      this.idempotencyRepository.create({
        ownerKey: scope.ownerKey,
        idempotencyKey: scope.idempotencyKey,
        endpoint: scope.endpoint,
        requestHash: scope.requestHash,
        status: IdempotencyStatus.IN_PROGRESS,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_RETENTION_SEC * 1000),
      }),
    );

    if (created) {
      return { type: 'started', id: created.id };
    }

    const existing = await this.idempotencyRepository.findByScope(
      scope.ownerKey,
      scope.endpoint,
      scope.idempotencyKey,
    );

    // 삽입과 조회 사이에 만료 배치가 지웠다면 처음 요청과 같게 취급한다
    if (!existing) {
      return this.begin(scope, now);
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      await this.idempotencyRepository.deleteById(existing.id);
      return this.begin(scope, now);
    }

    // 같은 키에 다른 본문 — 첫 응답을 돌려주면 요청한 적 없는 결과를 받게 된다
    if (existing.requestHash !== scope.requestHash) {
      throw this.conflict();
    }

    // 동시에 도착한 두 번째 요청 — 둘 다 실행되는 것을 막는 것이 in_progress의 목적이다
    if (existing.status === IdempotencyStatus.IN_PROGRESS) {
      throw this.conflict();
    }

    return {
      type: 'replay',
      status: existing.responseStatus ?? 0,
      body: existing.responseBody,
    };
  }

  /** `body`는 직렬화된 응답 원문이다. 본문이 없는 응답(204)은 null */
  async complete(
    id: string,
    status: number,
    body: string | null,
  ): Promise<void> {
    const key = await this.idempotencyRepository.findById(id);

    // 탈퇴처럼 자기 스코프를 파기하는 요청은 이 시점에 행이 이미 없다
    if (!key) {
      return;
    }

    key.status = IdempotencyStatus.COMPLETED;
    key.responseStatus = status;
    key.responseBody = body ?? null;
    await this.idempotencyRepository.save(key);
  }

  /** 실패한 요청은 같은 키로 다시 시도할 수 있어야 한다 (domain.md 1.4) */
  async discard(id: string): Promise<void> {
    await this.idempotencyRepository.deleteById(id);
  }

  /** 탈퇴 시 즉시 파기 (domain.md 12.3) */
  async purgeByOwnerKey(
    ownerKey: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.idempotencyRepository.deleteByOwnerKey(ownerKey, manager);
  }

  async purgeExpired(now: Date): Promise<void> {
    await this.idempotencyRepository.deleteExpired(now);
  }

  private conflict(): BusinessConflictException {
    return new BusinessConflictException({
      errorCode: ErrorCode.CONFLICT,
      message: '이미 처리된 요청이에요',
      logLevel: 'info',
    });
  }
}
