import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { PlayRecord } from '../entities/play-record.entity';

@Injectable()
export class PlayRecordRepository {
  constructor(
    @InjectRepository(PlayRecord)
    private readonly repository: Repository<PlayRecord>,
  ) {}

  private scoped(manager?: EntityManager): Repository<PlayRecord> {
    return manager ? manager.getRepository(PlayRecord) : this.repository;
  }

  /**
   * `daily_play_count` — **컬럼이 아니라 이 집계다**(domain.md 1.5 · 6.3).
   * 저장된 카운터를 읽지 않으므로 컬럼과 집계가 어긋날 여지가 없다.
   */
  async countByUserIdAndPlayDate(
    userId: string,
    playDate: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).countBy({ userId, playDate });
  }

  async existsByUserIdAndContentIdAndPlayDate(
    userId: string,
    contentId: string,
    playDate: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.scoped(manager).existsBy({ userId, contentId, playDate });
  }

  /** 목록의 `is_counted_today` — 오늘의 서비스 날짜에 행이 있는 `content_id` 집합 */
  async findAllCountedContentIds(
    userId: string,
    playDate: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('record')
      .select('record.content_id', 'content_id')
      .where('record.user_id = :userId', { userId })
      .andWhere('record.play_date = :playDate', { playDate })
      .getRawMany<{ content_id: string }>();

    return rows.map((row) => row.content_id);
  }

  /**
   * 재생 시작 적재. **하루 단위 멱등을 DB가 보장한다** —
   * `uq_play_records_user_id_content_id_play_date`가 같은 날 같은 콘텐츠의 두 번째 행을
   * 막으므로(`paywall.md` 4.3) 유니크 위반을 예외로 만들지 않고 흡수한다
   * (architecture.md 8.4).
   *
   * @returns 이 요청으로 행이 **새로 생겼는지**. 응답의 `counted`가 이 값이다.
   */
  async insertIgnoringConflicts(
    record: Partial<PlayRecord>,
    manager?: EntityManager,
  ): Promise<boolean> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .into(PlayRecord)
      .values(record)
      .orIgnore()
      .returning('id')
      .execute();

    return (result.raw as unknown[]).length > 0;
  }
}
