import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  LessThan,
  Like,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { IdempotencyKey } from './idempotency-key.entity';

/** Postgres unique_violation */
const UNIQUE_VIOLATION_CODE = '23505';

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
      if (error instanceof QueryFailedError && this.isUniqueViolation(error)) {
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

  async deleteByOwnerKey(
    ownerKey: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).delete({ ownerKey });
  }

  /** 보존 24시간 배치용 (domain.md 1.4) */
  async deleteExpired(now: Date, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ expiresAt: LessThan(now) });
  }

  /** 특정 사용자 스코프만 지우기 위한 접두사 조회 (탈퇴 파기) */
  async countByOwnerKeyPrefix(
    prefix: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).countBy({ ownerKey: Like(`${prefix}%`) });
  }

  private isUniqueViolation(error: QueryFailedError): boolean {
    return (
      (error.driverError as { code?: string }).code === UNIQUE_VIOLATION_CODE
    );
  }
}
