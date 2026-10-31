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
   * 기간 `[start, end)` 안에 종류가 `type`이거나 `type.`으로 시작하는(실험 그룹이 붙은 — `drip_arrival.a`) 같은 상태의
   * 기록이 있는 사용자. `(user_id, scheduled_at DESC)` 인덱스를 그대로 탄다.
   */
  async findUserIdsWithTypePrefixStatusBetween(
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
      .andWhere('(log.type = :type OR log.type LIKE :typePrefix)', {
        type,
        typePrefix: `${type}.%`,
      })
      .andWhere('log.status = :status', { status })
      .getRawMany<{ user_id: string }>();

    return rows.map((row) => row.user_id);
  }

  /**
   * `since` 이후 보낸(`sent`) 기록 중 종류가 `typePrefix`로 시작하는 것 — 리텐션 알림의 빈도·쿨다운 판정
   * (`notification.md` 4.6). 종류에 규칙·변형이 들어 있어(`retention.<규칙>.<변형>`) 머리로 묶는다.
   */
  async findSentByTypePrefixSince(
    userIds: string[],
    typePrefix: string,
    since: Date,
    manager?: EntityManager,
  ): Promise<{ userId: string; type: string; sentAt: Date }[]> {
    if (userIds.length === 0) {
      return [];
    }

    const rows = await this.scoped(manager)
      .createQueryBuilder('log')
      .select('log.user_id', 'user_id')
      .addSelect('log.type', 'type')
      .addSelect('log.sent_at', 'sent_at')
      .where('log.user_id IN (:...userIds)', { userIds })
      .andWhere('log.scheduled_at >= :since', { since })
      .andWhere('log.type LIKE :prefix', { prefix: `${typePrefix}%` })
      .andWhere('log.status = :status', { status: NotificationStatus.SENT })
      .getRawMany<{ user_id: string; type: string; sent_at: Date }>();

    return rows.map((row) => ({
      userId: row.user_id,
      type: row.type,
      sentAt: new Date(row.sent_at),
    }));
  }

  /** `since` 이후 종류가 `type`이고 상태가 `status`인 기록이 있는 사용자 — 보내지 않은 기록(비교 그룹)의 하루 1건 판정 */
  async findUserIdsByTypeAndStatusSince(
    userIds: string[],
    type: string,
    status: NotificationStatus,
    since: Date,
    manager?: EntityManager,
  ): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }

    const rows = await this.scoped(manager)
      .createQueryBuilder('log')
      .select('DISTINCT log.user_id', 'user_id')
      .where('log.user_id IN (:...userIds)', { userIds })
      .andWhere('log.scheduled_at >= :since', { since })
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
