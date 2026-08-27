import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { StatsPeriodType } from '../content.enum';
import { ContentStat } from '../entities/content-stat.entity';

@Injectable()
export class ContentStatRepository {
  constructor(
    @InjectRepository(ContentStat)
    private readonly repository: Repository<ContentStat>,
  ) {}

  private scoped(manager?: EntityManager): Repository<ContentStat> {
    return manager ? manager.getRepository(ContentStat) : this.repository;
  }

  /**
   * 표본 충분 여부 판정용 재생 합계 (onboarding.md 4 [3]).
   * **`is_final = true` 행만 읽는다** — 진행 중인 구간을 쓰면 순위가 매일 흔들린다.
   */
  async sumPlayCount(
    periodType: StatsPeriodType,
    periodStart: string,
    manager?: EntityManager,
  ): Promise<number> {
    const row = await this.scoped(manager)
      .createQueryBuilder('stat')
      .select('COALESCE(SUM(stat.play_count), 0)', 'total')
      .where('stat.period_type = :periodType', { periodType })
      .andWhere('stat.period_start = :periodStart', { periodStart })
      .andWhere('stat.is_final = true')
      .getRawOne<{ total: string }>();

    return Number(row?.total ?? 0);
  }

  /** 직전 확정 구간의 순위 — 상위 `limit`건의 `content_id`를 재생 수 순으로 */
  async findTopContentIds(
    periodType: StatsPeriodType,
    periodStart: string,
    limit: number,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('stat')
      .select('stat.content_id', 'content_id')
      .where('stat.period_type = :periodType', { periodType })
      .andWhere('stat.period_start = :periodStart', { periodStart })
      .andWhere('stat.is_final = true')
      .orderBy('stat.play_count', 'DESC')
      // 동점 구간의 순서를 고정한다 — 재진입 시 같은 결과를 보장해야 한다
      .addOrderBy('stat.content_id', 'ASC')
      .limit(limit)
      .getRawMany<{ content_id: string }>();

    return rows.map((row) => row.content_id);
  }

  /**
   * 전체 구간(`period_type = all`) 집계 — 편성 스코어링의 인기도 입력이다
   * (`drip-scheduling.md` 4.2 ③). 전체 구간에는 확정 개념이 없어 `is_final`을 걸지 않는다.
   */
  async findAllTimeByContentIds(
    contentIds: string[],
    allTimePeriodStart: string,
    manager?: EntityManager,
  ): Promise<ContentStat[]> {
    if (contentIds.length === 0) {
      return [];
    }

    return this.scoped(manager)
      .createQueryBuilder('stat')
      .where('stat.content_id IN (:...contentIds)', { contentIds })
      .andWhere('stat.period_type = :periodType', {
        periodType: StatsPeriodType.ALL,
      })
      .andWhere('stat.period_start = :periodStart', {
        periodStart: allTimePeriodStart,
      })
      .getMany();
  }

  async saveAll(
    stats: ContentStat[],
    manager?: EntityManager,
  ): Promise<ContentStat[]> {
    return this.scoped(manager).save(stats);
  }

  create(stat: Partial<ContentStat>): ContentStat {
    return this.repository.create(stat);
  }
}
