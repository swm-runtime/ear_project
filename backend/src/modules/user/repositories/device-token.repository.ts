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
}
