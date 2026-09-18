import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { NotificationLog } from '../entities/notification-log.entity';
import { NotificationStatus, NotificationType } from '../notification.enum';

@Injectable()
export class NotificationLogRepository {
  constructor(
    @InjectRepository(NotificationLog)
    private readonly repository: Repository<NotificationLog>,
  ) {}

  private scoped(manager?: EntityManager): Repository<NotificationLog> {
    return manager ? manager.getRepository(NotificationLog) : this.repository;
  }

  /**
   * 기간 `[start, end)` 안에 같은 종류·상태의 기록이 있는 사용자.
   * `(user_id, scheduled_at DESC)` 인덱스를 그대로 탄다.
   */
  async findUserIdsWithStatusBetween(
    userIds: string[],
    type: NotificationType,
    status: NotificationStatus,
    start: Date,
    end: Date,
    manager?: EntityManager,
  ): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }

    const rows = await this.scoped(manager)
      .createQueryBuilder('log')
      .select('DISTINCT log.user_id', 'user_id')
      .where('log.user_id IN (:...userIds)', { userIds })
      .andWhere('log.scheduled_at >= :start', { start })
      .andWhere('log.scheduled_at < :end', { end })
      .andWhere('log.type = :type', { type })
      .andWhere('log.status = :status', { status })
      .getRawMany<{ user_id: string }>();

    return rows.map((row) => row.user_id);
  }

  async insertAll(
    logs: Partial<NotificationLog>[],
    manager?: EntityManager,
  ): Promise<void> {
    if (logs.length === 0) {
      return;
    }

    await this.scoped(manager).insert(logs);
  }
}
