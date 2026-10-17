import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserMarket } from '@/modules/user/user.enum';

import { DailyActiveUser } from './daily-active-user.entity';

/**
 * 일별 접속자(`daily_active_users`). Raw SQL 이다(architecture.md 3.4) — 세션을 날짜 범위로 세어 한 문장으로 upsert 한다.
 * `users`는 시장(`market`)을 읽으려고 조인만 한다(쓰지 않는다).
 */
@Injectable()
export class DailyActiveUserRepository {
  constructor(
    @InjectRepository(DailyActiveUser)
    private readonly repository: Repository<DailyActiveUser>,
  ) {}

  private scoped(manager?: EntityManager): Repository<DailyActiveUser> {
    return manager ? manager.getRepository(DailyActiveUser) : this.repository;
  }

  /**
   * `activeDate`(KST 달력일)의 접속자를 시장마다 **다시 세어** 넣는다. 시장마다 한 행 — 접속자가 없어도 0 행을 둔다.
   *
   * 이미 행이 있으면 **큰 값을 남긴다**(`GREATEST`). 같은 날을 몇 번 다시 세도 결과가 같고(멱등), 그 사이 탈퇴한 사람의 세션이
   * 지워져 원천이 줄어도 기록은 줄지 않는다 — 이 표가 생긴 이유(원천이 사라진 뒤에도 남는 숫자)와 같은 방향이다.
   */
  async recount(activeDate: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).query(
      `INSERT INTO daily_active_users (active_date, market, active_users)
       SELECT $1::date, m.market, coalesce(c.active_users, 0)
         FROM unnest($2::varchar[]) AS m(market)
         LEFT JOIN (
           SELECT u.market, count(DISTINCT s.user_id)::int AS active_users
             FROM sessions s
             JOIN users u ON u.id = s.user_id
            WHERE s.issued_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Seoul'
              AND s.issued_at < ($1::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul'
            GROUP BY u.market
         ) c ON c.market = m.market
       ON CONFLICT (active_date, market) DO UPDATE
          SET active_users = GREATEST(daily_active_users.active_users, EXCLUDED.active_users),
              updated_at = now()`,
      [activeDate, Object.values(UserMarket)],
    );
  }
}
