import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { DripFeedback } from './drip-feedback.entity';
import { DripFeedbackVersionSummary } from './drip-feedback.types';

interface VersionRow {
  algorithm_version: string | null;
  placements: number;
  placed_users: number;
  first_placed_at: Date | null;
  last_placed_at: Date | null;
  ratings: number;
  rated_users: number;
  average_stars: number | null;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
}

@Injectable()
export class DripFeedbackRepository {
  constructor(
    @InjectRepository(DripFeedback)
    private readonly repository: Repository<DripFeedback>,
  ) {}

  private scoped(manager?: EntityManager): Repository<DripFeedback> {
    return manager ? manager.getRepository(DripFeedback) : this.repository;
  }

  async findAllByUserIdAndContentIds(
    userId: string,
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<DripFeedback[]> {
    if (contentIds.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({ userId, contentId: In(contentIds) });
  }

  /** 같은 콘텐츠의 재전송은 덮어쓴다 — `(user_id, content_id)` 유니크 위에서 upsert */
  async upsert(
    rows: Pick<
      DripFeedback,
      | 'userId'
      | 'contentId'
      | 'source'
      | 'algorithmVersion'
      | 'placedDate'
      | 'stars'
    >[],
    manager?: EntityManager,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .into(DripFeedback)
      .values(rows)
      .orUpdate(['stars', 'updated_at'], ['user_id', 'content_id'])
      .execute();
  }

  /**
   * 알고리즘 버전별 요약 — 편성 수는 `library_items`(삭제분 포함)에서, 평점은 이 표에서. 버전 문자열은
   * `YYYY-MM-DD.n`이라 문자열 역순이 최신순이다. NULL(버전 도입 전)은 맨 뒤.
   */
  async summarizeByVersion(
    manager?: EntityManager,
  ): Promise<DripFeedbackVersionSummary[]> {
    const rows = await this.scoped(manager).manager.query<VersionRow[]>(
      `with placed as (
         select algorithm_version,
                count(*)::int as placements,
                count(distinct user_id)::int as placed_users,
                min(added_at) as first_placed_at,
                max(added_at) as last_placed_at
           from library_items
          where source in ('drip', 'discovery')
          group by algorithm_version
       ), rated as (
         select algorithm_version,
                count(*)::int as ratings,
                count(distinct user_id)::int as rated_users,
                avg(stars)::float as average_stars,
                count(*) filter (where stars = 1)::int as s1,
                count(*) filter (where stars = 2)::int as s2,
                count(*) filter (where stars = 3)::int as s3,
                count(*) filter (where stars = 4)::int as s4,
                count(*) filter (where stars = 5)::int as s5
           from drip_feedbacks
          group by algorithm_version
       )
       select coalesce(p.algorithm_version, r.algorithm_version) as algorithm_version,
              coalesce(p.placements, 0) as placements,
              coalesce(p.placed_users, 0) as placed_users,
              p.first_placed_at, p.last_placed_at,
              coalesce(r.ratings, 0) as ratings,
              coalesce(r.rated_users, 0) as rated_users,
              r.average_stars,
              coalesce(r.s1, 0) as s1, coalesce(r.s2, 0) as s2, coalesce(r.s3, 0) as s3,
              coalesce(r.s4, 0) as s4, coalesce(r.s5, 0) as s5
         from placed p
         -- NULL 버전(도입 전)끼리도 붙어야 한다. "is not distinct from" 은 FULL JOIN 조건으로 못 쓴다
         -- (hash/merge 조인 불가 — e2e 실측 2026-09-30) → 빈 문자열로 맞춰 등호로 붙인다
         full outer join rated r
           on coalesce(r.algorithm_version, '') = coalesce(p.algorithm_version, '')
        order by coalesce(p.algorithm_version, r.algorithm_version) desc nulls last`,
    );

    return rows.map((row) => ({
      algorithmVersion: row.algorithm_version,
      placements: row.placements,
      placedUsers: row.placed_users,
      firstPlacedAt: row.first_placed_at,
      lastPlacedAt: row.last_placed_at,
      ratings: row.ratings,
      ratedUsers: row.rated_users,
      averageStars: row.average_stars,
      distribution: {
        '1': row.s1,
        '2': row.s2,
        '3': row.s3,
        '4': row.s4,
        '5': row.s5,
      },
    }));
  }
}
