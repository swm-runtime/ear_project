import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserSignal } from '../entities/user-signal.entity';

@Injectable()
export class UserSignalRepository {
  constructor(
    @InjectRepository(UserSignal)
    private readonly repository: Repository<UserSignal>,
  ) {}

  private scoped(manager?: EntityManager): Repository<UserSignal> {
    return manager ? manager.getRepository(UserSignal) : this.repository;
  }

  /**
   * 이력 테이블이라 **중복을 막지 않는다.** 같은 행동을 두 번 하면 두 행이 남는 것이
   * 맞다 — 최근성 가중(`drip-scheduling.md` 4.3)이 그 빈도를 읽는다.
   */
  async insert(
    signal: Partial<UserSignal>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).insert(signal);
  }
}
