import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { ContentStatus } from '@/modules/content/content.enum';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { UserMarket } from '@/modules/user/user.enum';

import { ContentReview } from './entities/content-review.entity';
import {
  AdminContentReviewCursorPosition,
  AdminContentReviewItemSummary,
  AdminContentReviewListFilter,
  AdminContentReviewPage,
  AdminContentReviewRow,
  AdminContentReviewSummaryFilter,
  ContentReviewDraft,
  ContentReviewPromptCandidate,
} from './content-review.types';

interface PromptCandidateRow {
  content_id: string;
  title: string;
  thumbnail_url: string;
  language: ContentReviewPromptCandidate['language'];
  completed_at: Date;
}

interface SummaryRow {
  content_id: string;
  title: string;
  market: UserMarket;
  status: ContentStatus;
  content_version: number;
  reviews: number;
  stars_sum: number;
  average_stars: number | null;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  text_reviews: number;
  completed_reviews: number;
  last_reviewed_at: Date;
}

interface VersionRow {
  content_id: string;
  content_version: number;
  reviews: number;
  average_stars: number | null;
}

interface ListRow {
  id: string;
  content_id: string;
  content_title: string;
  content_status: ContentStatus;
  stars: number;
  text: string | null;
  is_completed: boolean;
  content_version: number;
  market: UserMarket;
  created_at: Date;
  updated_at: Date;
  updated_at_exact: string;
}

/** 평균을 소수 둘째 자리로 — 콘솔 표시용. 후기가 없으면 `null` */
function roundAverage(value: number | null): number | null {
  return value === null ? null : Math.round(Number(value) * 100) / 100;
}

@Injectable()
export class ContentReviewRepository {
  constructor(
    @InjectRepository(ContentReview)
    private readonly repository: Repository<ContentReview>,
  ) {}

  private scoped(manager?: EntityManager): Repository<ContentReview> {
    return manager ? manager.getRepository(ContentReview) : this.repository;
  }

  async findByUserIdAndContentId(
    userId: string,
    contentId: string,
    manager?: EntityManager,
  ): Promise<ContentReview | null> {
    return this.scoped(manager).findOneBy({ userId, contentId });
  }

  /**
   * `(user_id, content_id)` 유니크 위의 upsert — 같은 편의 재전송 · 수정은 **그 시점 값으로** 덮어쓴다(domain.md 6.8).
   * `created_at`은 처음 쓴 시각 그대로다. 저장된 행을 돌려준다.
   */
  async upsert(
    draft: ContentReviewDraft,
    manager?: EntityManager,
  ): Promise<ContentReview> {
    const repository = this.scoped(manager);

    await repository
      .createQueryBuilder()
      .insert()
      .into(ContentReview)
      .values(draft)
      .orUpdate(
        [
          'stars',
          'text',
          'is_completed',
          'content_version',
          'market',
          'updated_at',
        ],
        ['user_id', 'content_id'],
      )
      .execute();

    return repository.findOneByOrFail({
      userId: draft.userId,
      contentId: draft.contentId,
    });
  }

  /**
   * 먼저 묻는 편 하나(`content-review-api.md` 4.3-4) — `since` 이후에 **끝까지 들었고** 아직 후기가 없는 편 중 가장 최근에
   * 끝까지 들은 편.
   *
   * - "끝까지 들은 시각" = 라이브러리 행의 완청 시각(`completed_at` — 삭제분 포함), 없으면 완청 신호(`user_signals.action =
   *   complete`)의 마지막 시각이다(계약 4.3). 위치만 90%를 넘은 편은 시각이 없어 묻지 않는다.
   * - 노출 조건(`published` + 라이선스 유효 — `content.visibility.ts`와 같은 조건) · 현재 시장 · 재생 시작(위치 또는 재생 기록)을
   *   만족하는 편만 본다. 저장(4.2)이 받아 줄 편만 묻는다.
   *
   * 원천이 `library`(`library_items`) · `playback`(`user_signals` · `playback_progresses` · `play_records`) 소유 표에 걸친
   * 읽기 전용 판정이라 raw SQL 한 번으로 읽는다(architecture.md 3.4 — 완청 CTE `LibraryItemRepository`와 같은 형태).
   * Service 로 나눠 읽으면 "라이브러리 완청 시각이 14일보다 오래됐지만 신호는 최근"인 편을 가르려고 후보 전부를 오가야 한다.
   */
  async findPromptCandidate(
    query: {
      userId: string;
      market: UserMarket;
      since: Date;
      now: Date;
    },
    manager?: EntityManager,
  ): Promise<ContentReviewPromptCandidate | null> {
    const rows: PromptCandidateRow[] = await this.scoped(manager).query(
      `WITH lib AS (
         SELECT item.content_id, max(item.completed_at) AS at
           FROM library_items item
          WHERE item.user_id = $1 AND item.status = $2 AND item.completed_at IS NOT NULL
          GROUP BY item.content_id
       ), sig AS (
         SELECT signal.content_id, max(signal.created_at) AS at
           FROM user_signals signal
          WHERE signal.user_id = $1 AND signal.action = 'complete'
          GROUP BY signal.content_id
       ), done AS (
         SELECT coalesce(lib.content_id, sig.content_id) AS content_id,
                coalesce(lib.at, sig.at) AS completed_at
           FROM lib
           FULL OUTER JOIN sig ON sig.content_id = lib.content_id
       )
       SELECT done.content_id, done.completed_at,
              content.title, content.thumbnail_url, content.language
         FROM done
         JOIN contents content ON content.id = done.content_id
        WHERE done.completed_at >= $3
          AND content.status = $4
          AND (content.license_expires_at IS NULL OR content.license_expires_at > $5)
          AND content.market = $6
          AND NOT EXISTS (
            SELECT 1 FROM content_reviews review
             WHERE review.user_id = $1 AND review.content_id = done.content_id
          )
          AND (
            EXISTS (
              SELECT 1 FROM playback_progresses progress
               WHERE progress.user_id = $1 AND progress.content_id = done.content_id
            )
            OR EXISTS (
              SELECT 1 FROM play_records record
               WHERE record.user_id = $1 AND record.content_id = done.content_id
            )
          )
        ORDER BY done.completed_at DESC, done.content_id
        LIMIT 1`,
      [
        query.userId,
        LibraryItemStatus.COMPLETED,
        query.since,
        ContentStatus.PUBLISHED,
        query.now,
        query.market,
      ],
    );
    const row = rows[0];

    return row
      ? {
          contentId: row.content_id,
          title: row.title,
          thumbnailUrl: row.thumbnail_url,
          language: row.language,
          completedAt: new Date(row.completed_at),
        }
      : null;
  }

  /**
   * 관리자 편별 집계(4.8) — 후기가 1건 이상인 편, 마지막 후기 최신순. 시장 필터는 **편의 시장**이다.
   * 사용자 식별값은 읽지도 돌려주지도 않는다.
   */
  async summarizeByContent(
    filter: AdminContentReviewSummaryFilter,
    manager?: EntityManager,
  ): Promise<AdminContentReviewItemSummary[]> {
    const parameters = [filter.contentId, filter.market];
    const where = `($1::uuid IS NULL OR review.content_id = $1::uuid)
          AND ($2::varchar IS NULL OR content.market = $2::varchar)`;
    const rows: SummaryRow[] = await this.scoped(manager).query(
      `SELECT review.content_id, content.title, content.market, content.status, content.content_version,
              count(*)::int AS reviews,
              sum(review.stars)::int AS stars_sum,
              avg(review.stars)::float AS average_stars,
              count(*) FILTER (WHERE review.stars = 1)::int AS s1,
              count(*) FILTER (WHERE review.stars = 2)::int AS s2,
              count(*) FILTER (WHERE review.stars = 3)::int AS s3,
              count(*) FILTER (WHERE review.stars = 4)::int AS s4,
              count(*) FILTER (WHERE review.stars = 5)::int AS s5,
              count(review.text)::int AS text_reviews,
              count(*) FILTER (WHERE review.is_completed)::int AS completed_reviews,
              max(review.updated_at) AS last_reviewed_at
         FROM content_reviews review
         JOIN contents content ON content.id = review.content_id
        WHERE ${where}
        GROUP BY review.content_id, content.title, content.market, content.status, content.content_version
        ORDER BY last_reviewed_at DESC, review.content_id`,
      parameters,
    );
    const versions: VersionRow[] = await this.scoped(manager).query(
      `SELECT review.content_id, review.content_version,
              count(*)::int AS reviews,
              avg(review.stars)::float AS average_stars
         FROM content_reviews review
         JOIN contents content ON content.id = review.content_id
        WHERE ${where}
        GROUP BY review.content_id, review.content_version
        ORDER BY review.content_id, review.content_version DESC`,
      parameters,
    );
    const versionsByContent = new Map<string, VersionRow[]>();
    for (const version of versions) {
      const list = versionsByContent.get(version.content_id) ?? [];
      list.push(version);
      versionsByContent.set(version.content_id, list);
    }

    return rows.map((row) => ({
      contentId: row.content_id,
      title: row.title,
      market: row.market,
      status: row.status,
      contentVersion: row.content_version,
      reviews: row.reviews,
      starsSum: row.stars_sum,
      averageStars: roundAverage(row.average_stars),
      distribution: {
        '1': row.s1,
        '2': row.s2,
        '3': row.s3,
        '4': row.s4,
        '5': row.s5,
      },
      textReviews: row.text_reviews,
      completedReviews: row.completed_reviews,
      lastReviewedAt: new Date(row.last_reviewed_at),
      byVersion: (versionsByContent.get(row.content_id) ?? []).map(
        (version) => ({
          contentVersion: version.content_version,
          reviews: version.reviews,
          averageStars: roundAverage(version.average_stars),
        }),
      ),
    }));
  }

  /**
   * 관리자 글 목록(4.9) — 마지막으로 고친 순 최신순(`updated_at DESC, id DESC`) keyset. 시장 필터는 **후기를 쓴 때의 사용자 시장**.
   * `limit + 1`건을 읽어 다음 페이지 유무를 정한다. **작성자(`user_id`)는 SELECT 하지 않는다.**
   *
   * 커서 시각은 마이크로초까지 담은 UTC 문자열로 비교한다 — `Date`(밀리초)로 자르면 같은 밀리초의 행이 경계에서 빠진다.
   */
  async findAdminPage(
    filter: AdminContentReviewListFilter,
    cursor: AdminContentReviewCursorPosition | null,
    limit: number,
    manager?: EntityManager,
  ): Promise<AdminContentReviewPage> {
    const rows: ListRow[] = await this.scoped(manager).query(
      `SELECT review.id, review.content_id, content.title AS content_title, content.status AS content_status,
              review.stars, review.text, review.is_completed, review.content_version, review.market,
              review.created_at, review.updated_at,
              to_char(review.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at_exact
         FROM content_reviews review
         JOIN contents content ON content.id = review.content_id
        WHERE ($1::uuid IS NULL OR review.content_id = $1::uuid)
          AND ($2::varchar IS NULL OR review.market = $2::varchar)
          AND ($3::boolean IS NULL OR (review.text IS NOT NULL) = $3::boolean)
          AND ($4::timestamptz IS NULL OR (review.updated_at, review.id) < ($4::timestamptz, $5::uuid))
        ORDER BY review.updated_at DESC, review.id DESC
        LIMIT $6`,
      [
        filter.contentId,
        filter.market,
        filter.hasText,
        cursor?.updatedAt ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );
    const page = rows.slice(0, limit).map((row): AdminContentReviewRow => ({
      id: row.id,
      contentId: row.content_id,
      contentTitle: row.content_title,
      contentStatus: row.content_status,
      stars: row.stars,
      text: row.text,
      isCompleted: row.is_completed,
      contentVersion: row.content_version,
      market: row.market,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      updatedAtExact: row.updated_at_exact,
    }));
    const last = page.at(-1);

    return {
      items: page,
      next:
        rows.length > limit && last
          ? { updatedAt: last.updatedAtExact, id: last.id }
          : null,
    };
  }
}
