import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  InspectorDeliveryRow,
  InspectorInterestRow,
  InspectorListeningRow,
  InspectorProfileRow,
  InspectorTopicRef,
  InspectorUserRow,
  InspectorUserSort,
} from './recommend-inspector.types';

/**
 * 추천 검증 조회 — **SELECT 만 있다.** 서비스 지표 요약(`AdminInsightsRepository`)처럼 여러 모듈의 표를 한 화면으로 모으는
 * 읽기 전용 집계라 소유 모듈이 없어 여기 둔다(Entity·쓰기 메서드 없음).
 *
 * `users`에서 읽는 열은 `id`·`tier`·`market`·`created_at`·온보딩 3열·커리어 2열·`status`뿐이다. **`email`·`nickname`·
 * `provider_user_id`·`profile_image_url`·`job_title` 은 어느 질의에도 없다** — 처리 목적("콘텐츠 편성과 추천 · 서비스 개선")에
 * 필요 없는 열은 서버 메모리에도 올리지 않는다. 탈퇴는 행을 지우므로(domain.md 12.3) 남은 행은 거의 `active`지만, 컬럼이
 * 남아 있으니 `status = 'active'`로 한 번 더 거른다.
 *
 * 합계는 `::float8`/`::int`로 받는다 — pg 드라이버가 `bigint`는 문자열로 돌려준다.
 */
@Injectable()
export class RecommendInspectorRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findUsers(
    sort: InspectorUserSort,
    since: Date,
    limit: number,
  ): Promise<InspectorUserRow[]> {
    // 정렬 키는 고정 문자열 두 개 중 하나다 — 사용자 입력을 SQL 에 잇지 않는다(DTO 가 enum 으로 검증)
    const listenOnly = sort === 'listen' ? 'and p.plays > 0' : '';
    const orderBy =
      sort === 'listen'
        ? 'p.listen_sec desc, p.plays desc, la.last_played_at desc nulls last, u.id'
        : 'coalesce(la.last_played_at, u.created_at) desc, u.id';
    const rows = await this.dataSource.query<
      {
        user_id: string;
        tier: string;
        signed_up_at: Date;
        market: string;
        interest_count: number;
        plays_30d: number;
        listen_sec_30d: number;
        completes_30d: number;
        last_played_at: Date | null;
      }[]
    >(
      `select u.id as user_id,
              u.tier,
              u.created_at as signed_up_at,
              u.market,
              coalesce(i.interest_count, 0)::int as interest_count,
              coalesce(p.plays, 0)::int as plays_30d,
              coalesce(p.listen_sec, 0)::float8 as listen_sec_30d,
              coalesce(s.completes, 0)::int as completes_30d,
              la.last_played_at
         from users u
         left join lateral (
           select count(*)::int as plays, sum(pr.listened_sec)::float8 as listen_sec
             from play_records pr
            where pr.user_id = u.id and pr.played_at >= $1
         ) p on true
         left join lateral (
           select count(*)::int as completes
             from user_signals us
            where us.user_id = u.id and us.action = 'complete' and us.created_at >= $1
         ) s on true
         left join lateral (
           select max(pr.played_at) as last_played_at
             from play_records pr
            where pr.user_id = u.id
         ) la on true
         left join lateral (
           select count(*)::int as interest_count
             from user_interests ui
            where ui.user_id = u.id and ui.is_active
         ) i on true
        where u.status = 'active' ${listenOnly}
        order by ${orderBy}
        limit $2`,
      [since, limit],
    );

    return rows.map((r) => ({
      userId: r.user_id,
      tier: r.tier,
      signedUpAt: r.signed_up_at,
      market: r.market,
      interestCount: r.interest_count,
      plays30d: r.plays_30d,
      listenSec30d: r.listen_sec_30d,
      completes30d: r.completes_30d,
      lastPlayedAt: r.last_played_at,
    }));
  }

  /** 탈퇴(행 없음·`status <> active`)면 null */
  async findProfile(userId: string): Promise<InspectorProfileRow | null> {
    const rows = await this.dataSource.query<
      {
        user_id: string;
        tier: string;
        market: string;
        signed_up_at: Date;
        onboarding_completed: boolean;
        onboarding_step: string;
        onboarding_completed_at: Date | null;
        job_category: string | null;
        years_of_experience: number | null;
        is_auto_expand_enabled: boolean | null;
      }[]
    >(
      `select u.id as user_id,
              u.tier,
              u.market,
              u.created_at as signed_up_at,
              u.onboarding_completed,
              u.onboarding_step,
              u.onboarding_completed_at,
              u.job_category,
              u.years_of_experience,
              st.is_auto_expand_enabled
         from users u
         left join user_settings st on st.user_id = u.id
        where u.id = $1 and u.status = 'active'`,
      [userId],
    );
    const r = rows[0];

    if (!r) {
      return null;
    }

    return {
      userId: r.user_id,
      tier: r.tier,
      market: r.market,
      signedUpAt: r.signed_up_at,
      onboardingCompleted: r.onboarding_completed,
      onboardingStep: r.onboarding_step,
      onboardingCompletedAt: r.onboarding_completed_at,
      jobCategory: r.job_category,
      yearsOfExperience: r.years_of_experience,
      // 설정 행이 없으면 기본값(켜짐) — `UserSettingService.getSettings`의 기본과 같다
      isAutoExpandEnabled: r.is_auto_expand_enabled ?? true,
    };
  }

  /** 비활성·직접 해제 행까지 전부 — 자동 슬롯 만료·교체 이력을 함께 본다 */
  async findInterests(userId: string): Promise<InspectorInterestRow[]> {
    const rows = await this.dataSource.query<
      {
        topic_id: string;
        name: string | null;
        is_visible: boolean | null;
        source: string;
        is_active: boolean;
        is_user_removed: boolean;
        created_at: Date;
        updated_at: Date;
        deactivated_at: Date | null;
      }[]
    >(
      `select ui.topic_id, t.name, t.is_visible, ui.source, ui.is_active, ui.is_user_removed,
              ui.created_at, ui.updated_at, ui.deactivated_at
         from user_interests ui
         left join topics t on t.id = ui.topic_id
        where ui.user_id = $1
        order by ui.is_active desc, ui.created_at asc, ui.topic_id`,
      [userId],
    );

    return rows.map((r) => ({
      topicId: r.topic_id,
      name: r.name,
      source: r.source,
      isActive: r.is_active,
      isUserRemoved: r.is_user_removed,
      isTopicVisible: r.is_visible,
      // 자동 슬롯의 "추가된 시각"은 별도 칸 없이 updated_at 이다(domain.md 4.2) — 활성 행에서만 그 뜻이다
      addedAt:
        r.source === 'auto_expand' && r.is_active ? r.updated_at : r.created_at,
      deactivatedAt: r.deactivated_at,
    }));
  }

  /**
   * 최근 `since` 이후 재생·완청·담기가 있었던 콘텐츠별 요약 — 최근 활동 순 `limit`개. 재생 행은 하루·콘텐츠당 1행이라
   * `play_days`는 "들은 서비스 날짜 수"다. 청취 비율의 원천은 `playback_progresses.max_reached_sec`(도달 위치)다.
   */
  async findListening(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<InspectorListeningRow[]> {
    const rows = await this.dataSource.query<
      {
        content_id: string;
        title: string;
        duration_sec: number;
        topics: InspectorTopicRow[] | null;
        first_played_at: Date | null;
        last_played_at: Date | null;
        play_days: number;
        listen_sec: number;
        complete_count: number;
        last_completed_at: Date | null;
        saved_at: Date | null;
        max_reached_sec: number | null;
      }[]
    >(
      `with activity as (
         select pr.content_id from play_records pr
          where pr.user_id = $1 and pr.played_at >= $2
         union
         select us.content_id from user_signals us
          where us.user_id = $1 and us.created_at >= $2 and us.action in ('complete', 'save')
       )
       select c.id as content_id, c.title, c.duration_sec,
              ${TOPICS_JSON_SQL} as topics,
              p.first_played_at, p.last_played_at,
              coalesce(p.play_days, 0)::int as play_days,
              coalesce(p.listen_sec, 0)::float8 as listen_sec,
              coalesce(s.complete_count, 0)::int as complete_count,
              s.last_completed_at, s.saved_at,
              pp.max_reached_sec
         from activity a
         join contents c on c.id = a.content_id
         left join lateral (
           select min(pr.played_at) as first_played_at, max(pr.played_at) as last_played_at,
                  count(*)::int as play_days, sum(pr.listened_sec)::float8 as listen_sec
             from play_records pr
            where pr.user_id = $1 and pr.content_id = c.id and pr.played_at >= $2
         ) p on true
         left join lateral (
           select count(*) filter (where us.action = 'complete')::int as complete_count,
                  max(us.created_at) filter (where us.action = 'complete') as last_completed_at,
                  max(us.created_at) filter (where us.action = 'save') as saved_at
             from user_signals us
            where us.user_id = $1 and us.content_id = c.id and us.created_at >= $2
         ) s on true
         left join playback_progresses pp on pp.user_id = $1 and pp.content_id = c.id
        order by greatest(p.last_played_at, s.last_completed_at, s.saved_at) desc nulls last, c.id
        limit $3`,
      [userId, since, limit],
    );

    return rows.map((r) => ({
      contentId: r.content_id,
      title: r.title,
      durationSec: r.duration_sec,
      topics: toTopicRefs(r.topics),
      firstPlayedAt: r.first_played_at,
      lastPlayedAt: r.last_played_at,
      playDays: r.play_days,
      listenSec: r.listen_sec,
      completeCount: r.complete_count,
      lastCompletedAt: r.last_completed_at,
      savedAt: r.saved_at,
      maxReachedSec: r.max_reached_sec,
    }));
  }

  /**
   * 편성 배치·첫 드립이 적립한 행(`source in drip, discovery`) — 삭제분 포함, 최신 적립 순. "그 뒤 들었나"는 적립 시각 뒤의
   * 재생 행, "완청했나"는 라이브러리 상태 또는 적립 뒤 완청 신호로 본다. 별점은 `drip_feedbacks`(추천 입력이 아니다).
   */
  async findDeliveries(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<InspectorDeliveryRow[]> {
    const rows = await this.dataSource.query<
      {
        content_id: string;
        title: string;
        topics: InspectorTopicRow[] | null;
        source: string;
        algorithm_version: string | null;
        added_at: Date;
        status: string;
        deleted_at: Date | null;
        played_after: boolean;
        completed_after: boolean;
        stars: number | null;
      }[]
    >(
      `select li.content_id, c.title, ${TOPICS_JSON_SQL} as topics,
              li.source, li.algorithm_version, li.added_at, li.status, li.deleted_at,
              exists (
                select 1 from play_records pr
                 where pr.user_id = li.user_id and pr.content_id = li.content_id
                   and pr.played_at >= li.added_at
              ) as played_after,
              (li.status = 'completed' or exists (
                select 1 from user_signals us
                 where us.user_id = li.user_id and us.content_id = li.content_id
                   and us.action = 'complete' and us.created_at >= li.added_at
              )) as completed_after,
              f.stars
         from library_items li
         join contents c on c.id = li.content_id
         left join drip_feedbacks f on f.user_id = li.user_id and f.content_id = li.content_id
        where li.user_id = $1 and li.source in ('drip', 'discovery') and li.added_at >= $2
        order by li.added_at desc, li.id desc
        limit $3`,
      [userId, since, limit],
    );

    return rows.map((r) => ({
      contentId: r.content_id,
      title: r.title,
      topics: toTopicRefs(r.topics),
      source: r.source,
      algorithmVersion: r.algorithm_version,
      addedAt: r.added_at,
      status: r.status,
      deletedAt: r.deleted_at,
      playedAfter: r.played_after,
      completedAfter: r.completed_after,
      feedbackStars: r.stars === null ? null : Number(r.stars),
    }));
  }

  /**
   * 후보 SQL(`ContentRepository.findCandidates` — `excludeSeenByUserId`)이 사용자마다 빼는 이력의 크기 — 라이브러리에 있었던
   * 콘텐츠(소프트 삭제분 포함)와 영구 제외 목록. 후보 풀이 왜 이 크기인지의 재료다(SQL 이 실제로 뺀 건수가 아니라 원천 행 수다 —
   * 노출 종료·다른 시장 콘텐츠도 섞여 있다).
   */
  async countExclusionSources(
    userId: string,
  ): Promise<{ libraryContents: number; permanentlyExcluded: number }> {
    const rows = await this.dataSource.query<
      { library_contents: number; permanently_excluded: number }[]
    >(
      `select (select count(*)::int from library_items li where li.user_id = $1) as library_contents,
              (select count(*)::int from drip_excluded_contents d where d.user_id = $1) as permanently_excluded`,
      [userId],
    );

    return {
      libraryContents: rows[0]?.library_contents ?? 0,
      permanentlyExcluded: rows[0]?.permanently_excluded ?? 0,
    };
  }

  /** 콘텐츠 → 주제(이름 포함). 취향 입력 신호를 주제별로 세는 데 쓴다 */
  async findContentTopics(
    contentIds: string[],
  ): Promise<{ contentId: string; topicId: string; name: string | null }[]> {
    if (contentIds.length === 0) {
      return [];
    }

    const rows = await this.dataSource.query<
      { content_id: string; topic_id: string; name: string | null }[]
    >(
      `select ct.content_id, ct.topic_id, t.name
         from content_topics ct
         left join topics t on t.id = ct.topic_id
        where ct.content_id = any($1::uuid[])`,
      [contentIds],
    );

    return rows.map((r) => ({
      contentId: r.content_id,
      topicId: r.topic_id,
      name: r.name,
    }));
  }
}

interface InspectorTopicRow {
  topic_id: string;
  name: string;
}

/** 콘텐츠 `c`의 주제 목록(JSON 배열) — 이름순 */
const TOPICS_JSON_SQL = `(
  select json_agg(json_build_object('topic_id', t.id, 'name', t.name) order by t.name)
    from content_topics ct join topics t on t.id = ct.topic_id
   where ct.content_id = c.id
)`;

function toTopicRefs(rows: InspectorTopicRow[] | null): InspectorTopicRef[] {
  return (rows ?? []).map((r) => ({ topicId: r.topic_id, name: r.name }));
}
