import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { PlayDailyTotal } from '../entities/play-daily-total.entity';

/**
 * 서비스 날짜별 누적(`play_daily_totals`). **읽어서 더한 값을 쓰지 않고 DB에서 더한다** — 여러 사용자의 재생·위치 저장이
 * 같은 날짜 행에 동시에 더하므로 read-modify-write는 서로의 증분을 덮어쓴다(`play_records.listened_sec`와 같은 이유).
 */
@Injectable()
export class PlayDailyTotalRepository {
  constructor(
    @InjectRepository(PlayDailyTotal)
    private readonly repository: Repository<PlayDailyTotal>,
  ) {}

  private scoped(manager?: EntityManager): Repository<PlayDailyTotal> {
    return manager ? manager.getRepository(PlayDailyTotal) : this.repository;
  }

  async add(
    playDate: string,
    delta: { playCount?: number; listenSec?: number; completeCount?: number },
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).query(
      `INSERT INTO play_daily_totals (play_date, play_count, listen_sec, complete_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (play_date) DO UPDATE
          SET play_count = play_daily_totals.play_count + EXCLUDED.play_count,
              listen_sec = play_daily_totals.listen_sec + EXCLUDED.listen_sec,
              complete_count = play_daily_totals.complete_count + EXCLUDED.complete_count,
              updated_at = now()`,
      [
        playDate,
        delta.playCount ?? 0,
        delta.listenSec ?? 0,
        delta.completeCount ?? 0,
      ],
    );
  }
}
