import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Not, Repository } from 'typeorm';

import { DeviceToken } from '../entities/device-token.entity';

@Injectable()
export class DeviceTokenRepository {
  constructor(
    @InjectRepository(DeviceToken)
    private readonly repository: Repository<DeviceToken>,
  ) {}

  private scoped(manager?: EntityManager): Repository<DeviceToken> {
    return manager ? manager.getRepository(DeviceToken) : this.repository;
  }

  async findByUserIdAndDeviceId(
    userId: string,
    deviceId: string,
    manager?: EntityManager,
  ): Promise<DeviceToken | null> {
    return this.scoped(manager).findOneBy({ userId, deviceId });
  }

  async save(
    deviceToken: DeviceToken,
    manager?: EntityManager,
  ): Promise<DeviceToken> {
    return this.scoped(manager).save(deviceToken);
  }

  create(deviceToken: Partial<DeviceToken>): DeviceToken {
    return this.repository.create(deviceToken);
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }

  /**
   * (user_id, device_id) 기준 **원자적 upsert** — `INSERT ... ON CONFLICT DO UPDATE`.
   *
   * find → save는 같은 (user, device)의 최초 동시 등록 두 건이 모두 "행 없음"을 보고 각자
   * INSERT 해 `uq_device_tokens_user_id_device_id` 위반(500)이 났다(2026-09-09 감사).
   * 한 문장으로 처리하면 제약이 충돌을 갱신으로 흡수한다(architecture.md 8.4).
   * 재등록이므로 `invalidated_at`은 항상 지운다.
   */
  async upsert(
    values: Pick<
      DeviceToken,
      | 'userId'
      | 'deviceId'
      | 'token'
      | 'platform'
      | 'isOsPermissionGranted'
      | 'appVersion'
    >,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .into(DeviceToken)
      .values({ ...values, invalidatedAt: null })
      .orUpdate(
        [
          'token',
          'platform',
          'is_os_permission_granted',
          'app_version',
          'invalidated_at',
          'updated_at',
        ],
        'uq_device_tokens_user_id_device_id',
      )
      .execute();
  }

  /**
   * 푸시를 보낼 수 있는 기기 — OS 권한 허용 · 토큰 있음 · 무효화되지 않음(`notification.md` 4.2).
   * 사용자당 여러 기기가 있을 수 있고 전부 대상이다(7장 "여러 기기 로그인").
   */
  async findDeliverableByUserIds(
    userIds: string[],
    manager?: EntityManager,
  ): Promise<DeviceToken[]> {
    if (userIds.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({
      userId: In(userIds),
      isOsPermissionGranted: true,
      token: Not(IsNull()),
      invalidatedAt: IsNull(),
    });
  }

  /**
   * **행 id 와 보낸 토큰이 둘 다 맞을 때만** 무효화한다. receipt 는 발송 15분 뒤에 오는데, 그사이 앱을
   * 다시 깔아 같은 `device_id` 행에 새 토큰이 upsert 됐을 수 있다 — id 만 보면 새 토큰을 끈다.
   */
  async invalidateByIdAndToken(
    targets: { id: string; token: string }[],
    now: Date,
    manager?: EntityManager,
  ): Promise<number> {
    let affected = 0;

    for (const target of targets) {
      const result = await this.scoped(manager)
        .createQueryBuilder()
        .update(DeviceToken)
        .set({ invalidatedAt: now })
        .where('id = :id', { id: target.id })
        .andWhere('token = :token', { token: target.token })
        .andWhere('invalidated_at IS NULL')
        .execute();
      affected += result.affected ?? 0;
    }

    return affected;
  }

  async invalidateByUserIdAndDeviceId(
    userId: string,
    deviceId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .update(DeviceToken)
      .set({ invalidatedAt: now })
      .where('user_id = :userId', { userId })
      .andWhere('device_id = :deviceId', { deviceId })
      .andWhere('invalidated_at IS NULL')
      .execute();

    return result.affected ?? 0;
  }

  /**
   * 같은 기기에 남아 있는 **다른 계정의** 등록을 무효화한다.
   * 행을 지우지 않고 `invalidated_at`을 찍는 이유는 재등록이 이 표시를 지우기 때문이다 —
   * 같은 사람이 계정을 오가는 경우 이력이 남고, 발송 대상 판정은 표시 하나로 끝난다.
   */
  async invalidateOtherUsersByDeviceId(
    deviceId: string,
    keepUserId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<number> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .update(DeviceToken)
      .set({ invalidatedAt: now })
      .where('device_id = :deviceId', { deviceId })
      .andWhere('user_id != :keepUserId', { keepUserId })
      .andWhere('invalidated_at IS NULL')
      .execute();

    return result.affected ?? 0;
  }
}
