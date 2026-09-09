import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, LessThan, Repository } from 'typeorm';

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

  /**
   * 회전 시 **아직 살아 있는 경우에만** 폐기한다 — 조건부 UPDATE의 affected로 판정한다.
   *
   * `findByRefreshTokenHash` → `save`의 read-modify-write는 동시 갱신 두 건이 둘 다
   * `revoked_at IS NULL`을 보고 통과해 한 토큰에서 세션 두 개가 나오는 경합이 있었다
   * (재사용 탐지가 우회됨 — 2026-09-09 감사). 이 경로는 한 건만 `true`를 받는다.
   */
  async revokeIfActive(
    id: string,
    revokedAt: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    const result = await this.scoped(manager).update(
      { id, revokedAt: IsNull() },
      { revokedAt },
    );

    return (result.affected ?? 0) > 0;
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

  /**
   * 만료(`expires_at`) 또는 폐기(`revoked_at`)가 기준 시각보다 앞선 세션을 지운다.
   * 활성 세션(`revoked_at IS NULL` 이고 `expires_at`이 기준 뒤)은 어느 조건에도 걸리지 않는다.
   * 반환값은 삭제 행 수.
   */
  async deleteInactiveBefore(
    before: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.scoped(manager).delete([
      { revokedAt: LessThan(before) },
      { expiresAt: LessThan(before) },
    ]);

    return result.affected ?? 0;
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
