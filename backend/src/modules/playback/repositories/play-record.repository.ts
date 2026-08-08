import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { PlayRecord } from '../entities/play-record.entity';

/**
 * `play_date`는 `date` 컬럼이라 Entity에서는 문자열이지만, **raw 조회에서는 드라이버가
 * `Date` 객체로 돌려줄 수 있다.** 어느 쪽이 오든 `YYYY-MM-DD` 라벨로 맞춘다 —
 * 서비스 날짜는 타임존 없는 라벨이며, `toISOString()`으로 변환하면 UTC 변환이 끼어들어
 * 하루가 밀린다.
 */
function toPlayDateLabel(value: string | Date): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

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
   * 누적 청취 시간(초) 총합 — `profile-api.md` 4.1 `total_listened_sec`.
   *
   * 배속·반복과 무관한 **실제 들은 시간**이므로 행 수가 아니라 `listened_sec`을 더한다
   * (`profile.md` 4.5). 기록이 없으면 SUM이 NULL이라 0으로 환산한다.
   */
  async sumListenedSecByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const row = await this.scoped(manager)
      .createQueryBuilder('record')
      .select('COALESCE(SUM(record.listened_sec), 0)', 'total')
      .where('record.user_id = :userId', { userId })
      .getRawOne<{ total: string }>();

    return Number(row?.total ?? 0);
  }

  /**
   * 재생 기록이 있는 **서비스 날짜 목록**(최신순, 중복 제거) — 연속 청취 일수의 원천.
   *
   * 연속 구간 계산을 SQL 윈도 함수로 하지 않는 이유는 규칙이 화면 소유이기 때문이다
   * (`profile.md` 4.5 — "그날 1건 이상이면 들은 날", 오늘 미청취 시 어제까지 유지).
   * 판정을 순수 함수로 빼야 04시 경계·오늘 미청취 케이스를 테스트할 수 있다.
   */
  async findAllPlayDatesByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('record')
      .select('record.play_date', 'play_date')
      .where('record.user_id = :userId', { userId })
      .groupBy('record.play_date')
      .orderBy('record.play_date', 'DESC')
      .getRawMany<{ play_date: string | Date }>();

    return rows.map((row) => toPlayDateLabel(row.play_date));
  }

  /**
   * 지정한 서비스 날짜들의 청취 시간 합 — 주간 그래프의 요일별 막대.
   *
   * `play_date`가 이미 04시 경계로 계산된 값이라(domain.md 1.2) 시각 범위가 아니라
   * **날짜 라벨 목록으로 직접 대조한다.** 주 경계를 쿼리에서 다시 계산하면 경계 규칙이
   * 두 곳에 생긴다.
   */
  async sumListenedSecByPlayDates(
    userId: string,
    playDates: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    if (playDates.length === 0) {
      return new Map();
    }

    const rows = await this.scoped(manager)
      .createQueryBuilder('record')
      .select('record.play_date', 'play_date')
      .addSelect('COALESCE(SUM(record.listened_sec), 0)', 'total')
      .where('record.user_id = :userId', { userId })
      .andWhere('record.play_date IN (:...playDates)', { playDates })
      .groupBy('record.play_date')
      .getRawMany<{ play_date: string | Date; total: string }>();

    return new Map(
      rows.map((row) => [toPlayDateLabel(row.play_date), Number(row.total)]),
    );
  }

  /**
   * 콘텐츠별 누적 청취 시간 — 주제 분포 집계의 원천(`profile.md` 4.7).
   *
   * 주제까지 한 쿼리로 조인하지 않는 이유는 `content_topics`가 **content 모듈 소유**이기
   * 때문이다(domain.md 2장). 여기서는 콘텐츠 축까지만 접고, 주제 매핑은 Orchestrator가
   * `ContentService`에서 받아 합친다 — 두 번의 조회이지 N+1이 아니다.
   */
  async sumListenedSecGroupByContentId(
    userId: string,
    manager?: EntityManager,
  ): Promise<{ contentId: string; listenedSec: number }[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('record')
      .select('record.content_id', 'content_id')
      .addSelect('COALESCE(SUM(record.listened_sec), 0)', 'total')
      .where('record.user_id = :userId', { userId })
      .groupBy('record.content_id')
      .getRawMany<{ content_id: string; total: string }>();

    return rows.map((row) => ({
      contentId: row.content_id,
      listenedSec: Number(row.total),
    }));
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
