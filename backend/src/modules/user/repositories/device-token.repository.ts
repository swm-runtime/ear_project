import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

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
