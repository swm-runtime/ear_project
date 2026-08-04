import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';

import { Session } from './session.entity';

@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(Session)
    private readonly repository: Repository<Session>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Session> {
    return manager ? manager.getRepository(Session) : this.repository;
  }

  create(session: Partial<Session>): Session {
    return this.repository.create(session);
  }

  async save(session: Session, manager?: EntityManager): Promise<Session> {
    return this.scoped(manager).save(session);
  }

  /** 폐기된 세션도 찾아야 재사용(탈취)을 감지할 수 있다 (architecture.md 9.1) */
  async findByRefreshTokenHash(
    refreshTokenHash: string,
    manager?: EntityManager,
  ): Promise<Session | null> {
    return this.scoped(manager).findOneBy({ refreshTokenHash });
  }

  async revokeAllByUserId(
    userId: string,
    revokedAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).update(
      { userId, revokedAt: IsNull() },
      { revokedAt },
    );
  }

  async revokeByUserIdAndDeviceId(
    userId: string,
    deviceId: string,
    revokedAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).update(
      { userId, deviceId, revokedAt: IsNull() },
      { revokedAt },
    );
  }
}
