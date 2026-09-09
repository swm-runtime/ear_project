import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThan, Like, Not, Repository } from 'typeorm';

import { isUniqueViolation } from '@/common/utils/unique-violation.util';

import { IdempotencyKey } from './idempotency-key.entity';
import { IdempotencyStatus } from './idempotency.enum';

@Injectable()
export class IdempotencyRepository {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repository: Repository<IdempotencyKey>,
  ) {}

  private scoped(manager?: EntityManager): Repository<IdempotencyKey> {
    return manager ? manager.getRepository(IdempotencyKey) : this.repository;
  }

  /**
   * 유니크 위반은 예외로 만들지 않고 `null`로 흡수한다 (architecture.md 8.4).
   * "먼저 조회하고 없으면 삽입"은 동시 요청 사이에 틈이 생기므로 삽입을 먼저 시도한다.
   */
  async insertIfAbsent(
    key: IdempotencyKey,
    manager?: EntityManager,
  ): Promise<IdempotencyKey | null> {
    try {
      return await this.scoped(manager).save(key);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  create(key: Partial<IdempotencyKey>): IdempotencyKey {
    return this.repository.create(key);
  }

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<IdempotencyKey | null> {
    return this.scoped(manager).findOneBy({ id });
  }

  async findByScope(
    ownerKey: string,
    endpoint: string,
    idempotencyKey: string,
    manager?: EntityManager,
  ): Promise<IdempotencyKey | null> {
    return this.scoped(manager).findOneBy({
      ownerKey,
      endpoint,
      idempotencyKey,
    });
  }

  async save(
    key: IdempotencyKey,
    manager?: EntityManager,
  ): Promise<IdempotencyKey> {
    return this.scoped(manager).save(key);
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ id });
  }

  /**
   * 탈퇴 파기(domain.md 12.3). **진행 중(`in_progress`) 행은 남긴다** — 그중 하나가 지금 이
   * 파기를 실행하는 탈퇴 요청 자신의 키다. 같이 지우면 `complete`가 기록할 행이 없어, 응답을
   * 못 받은 클라이언트의 같은 키 재시도가 저장된 204 대신 "사용자 없음"을 받는다
   * (`tickets/backend/.../audit-low-severity-bundle.md` #1). 남은 행은 24시간 만료 배치가 지운다.
   */
  async deleteByOwnerKey(
    ownerKey: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).delete({
      ownerKey,
      status: Not(IdempotencyStatus.IN_PROGRESS),
    });
  }

  /** 보존 24시간 배치용 (domain.md 1.4) */
  async deleteExpired(now: Date, manager?: EntityManager): Promise<number> {
    const result = await this.scoped(manager).delete({
      expiresAt: LessThan(now),
    });

    return result.affected ?? 0;
  }

  /** 특정 사용자 스코프만 지우기 위한 접두사 조회 (탈퇴 파기) */
  async countByOwnerKeyPrefix(
    prefix: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).countBy({ ownerKey: Like(`${prefix}%`) });
  }
}
