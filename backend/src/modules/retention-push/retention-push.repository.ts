import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { cohortLengthProfileSql } from '@/modules/content/content-cohort.policy';
import { seriesEpisodeUnlockedSql } from '@/modules/subscription/policies/series-paywall.policy';
import { UserMarket } from '@/modules/user/user.enum';

import {
  RESUME_CONTENT_MAX_REMAINING_SEC,
  RESUME_CONTENT_MIN_REMAINING_SEC,
} from './retention-push.rules';

export interface RetentionAudienceRow {
  userId: string;
  market: UserMarket;
  timezone: string | null;
}

export interface MorningFactRow {
  userId: string;
  /** `addedSince` 이후 받은(드립·탐험) 아직 안 들은(`unplayed`) 편 수 — 라이브러리에 살아 있고 같은 시장 공개 콘텐츠만 */
  unplayedCount: number;
  /** 그 편이 1편이면 그 편, 아니면 null */
  single: { contentId: string; title: string } | null;
  listenedRecently: boolean;
}

export interface RetentionUserFactRow {
  userId: string;
  listenedRecently: boolean;
  weekListenedSec: number;
  /** 최근 청취 서비스 날짜(`YYYY-MM-DD`), 최신순 — 연속 일수는 서비스가 센다 */
  recentPlayDates: string[];
  resume: { contentId: string; title: string; remainingSec: number } | null;
}

/**
 * 저녁 리텐션 알림의 **읽기 전용 집계**(`notification.md` 4.6). 여러 모듈의 표(users·consents·play_records·
 * playback_progresses·library_items·contents)를 한 번에 읽는 통계 쿼리라 raw SQL 을 여기에만 둔다
 * (architecture.md 3.4 — 관리자 지표 `AdminInsightsRepository`와 같은 예외). **쓰지 않는다.**
 * 이름·이메일 컬럼은 읽지 않는다 — 판정에 필요한 것은 집계와 `user_id`뿐이다.
 */
@Injectable()
export class RetentionPushRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 보낼 수 있는 후보 — 온보딩을 마쳤고, **최신 마케팅 수신 동의가 동의 상태**인 계정(광고성 정보 — 정보통신망법 50조).
   * 기기·OS 권한은 `DeviceTokenService`가 거른다.
   */
  async findAudience(): Promise<RetentionAudienceRow[]> {
    const rows = await this.dataSource.query<
      { user_id: string; market: UserMarket; timezone: string | null }[]
    >(
      `select u.id as user_id, u.market, u.timezone
         from users u
         join lateral (
           select c.is_agreed
             from consents c
            where c.user_id = u.id and c.consent_type = 'marketing'
            order by c.agreed_at desc
            limit 1
         ) marketing on marketing.is_agreed
        where u.onboarding_completed and u.withdrawn_at is null`,
    );

    return rows.map((row) => ({
      userId: row.user_id,
      market: row.market,
      timezone: row.timezone,
    }));
  }

  /**
   * 사용자별 사실. 사용자당 한 행 — `play_records`(user, play_date)·`playback_progresses`(user)·`library_items`(user)
   * 인덱스를 탄다. 듣던 콘텐츠는 **라이브러리에 살아 있고 진행 중이며 같은 시장의 공개 콘텐츠** 중 최근 `recentSince`
   * 이후 위치를 저장했고 남은 시간이 1~20분인 것 하나(가장 최근에 들은 것).
   */
  async findUserFacts(params: {
    userIds: string[];
    weekDates: string[];
    listenedSince: Date;
    playDatesSince: string;
    resumeSince: Date;
    /** 짧은 판 코호트 경계(`SHORT_CONTENT_COHORT_SINCE`) — null이면 전원 standard */
    shortCohortSince: Date | null;
    /**
     * 시리즈 유료화(KAN-290) 판정 입력(`SeriesPaywallService.resolveSqlParams`) — 이 사용자에게 잠긴 편은 "듣던 콘텐츠"가 아니다.
     * 빠지면(옛 호출) 잠그지 않는다
     */
    seriesLock?: {
      lockedAfterEpisodeNo: number | null;
      unlockedTiers: string[];
    };
    /** 체험 판정 시각(시리즈 유료화 — 체험 중이면 열림) */
    now?: Date;
  }): Promise<RetentionUserFactRow[]> {
    if (params.userIds.length === 0) {
      return [];
    }

    const rows = await this.dataSource.query<
      {
        user_id: string;
        listened_recently: boolean;
        week_listened_sec: number;
        recent_play_dates: string[] | null;
        resume_content_id: string | null;
        resume_title: string | null;
        resume_remaining_sec: number | null;
      }[]
    >(
      `select u.id as user_id,
              exists (
                select 1 from playback_progresses pp
                 where pp.user_id = u.id and pp.updated_at >= $3
              ) as listened_recently,
              coalesce((
                select sum(pr.listened_sec)
                  from play_records pr
                 where pr.user_id = u.id and pr.play_date = any($2::date[])
              ), 0)::float8 as week_listened_sec,
              (
                select array_agg(d.play_date::text order by d.play_date desc)
                  from (
                    select distinct pr.play_date
                      from play_records pr
                     where pr.user_id = u.id and pr.play_date >= $4::date
                  ) d
              ) as recent_play_dates,
              resume.content_id as resume_content_id,
              resume.title as resume_title,
              resume.remaining_sec as resume_remaining_sec
         from users u
         left join lateral (
           select c.id as content_id, c.title, (c.duration_sec - pp.position_sec) as remaining_sec
             from library_items li
             join playback_progresses pp on pp.user_id = li.user_id and pp.content_id = li.content_id
             join contents c on c.id = li.content_id
            where li.user_id = u.id
              and li.deleted_at is null
              and li.status = 'in_progress'
              and c.status = 'published'
              and c.market = u.market
              -- 짧은 판 코호트(KAN-298) — 규칙은 content-cohort.policy.ts 한 곳(SQL판)
              and c.length_profile = ${cohortLengthProfileSql('u.created_at', '$8')}
              and pp.updated_at >= $5
              and c.duration_sec - pp.position_sec between $6 and $7
              -- 시리즈 유료화(KAN-290) — 규칙은 series-paywall.policy.ts 한 곳(SQL판)
              and ${seriesEpisodeUnlockedSql({
                seriesId: 'c.series_id',
                episodeNo: 'c.episode_no',
                userTier: 'u.tier',
                userTrialEndsAt: 'u.trial_ends_at',
                lockedAfterParam: '$9',
                unlockedTiersParam: '$10',
                nowParam: '$11',
              })}
            order by pp.updated_at desc
            limit 1
         ) resume on true
        where u.id = any($1::uuid[])`,
      [
        params.userIds,
        params.weekDates,
        params.listenedSince,
        params.playDatesSince,
        params.resumeSince,
        RESUME_CONTENT_MIN_REMAINING_SEC,
        RESUME_CONTENT_MAX_REMAINING_SEC,
        params.shortCohortSince,
        params.seriesLock?.lockedAfterEpisodeNo ?? null,
        params.seriesLock?.unlockedTiers ?? [],
        params.now ?? new Date(),
      ],
    );

    return rows.map((row) => ({
      userId: row.user_id,
      listenedRecently: row.listened_recently,
      weekListenedSec: Number(row.week_listened_sec),
      recentPlayDates: row.recent_play_dates ?? [],
      resume:
        row.resume_content_id && row.resume_title !== null
          ? {
              contentId: row.resume_content_id,
              title: row.resume_title,
              remainingSec: Number(row.resume_remaining_sec),
            }
          : null,
    }));
  }

  /**
   * 아침 알림(KAN-288)의 사용자별 사실 — 최근 받은 미청취 편 수·1편이면 그 편·오늘 들었는지. 사용자당 한 행이고
   * `library_items`(user, deleted_at, added_at)·`playback_progresses`(user) 인덱스를 탄다. 담은 편(`save`·`onboarding`)은 세지
   * 않는다 — "추천받은 콘텐츠"를 말하는 알림이라 이어가 보낸 편(드립·탐험)만이다.
   */
  async findMorningFacts(params: {
    userIds: string[];
    addedSince: Date;
    listenedSince: Date;
  }): Promise<MorningFactRow[]> {
    if (params.userIds.length === 0) {
      return [];
    }

    const rows = await this.dataSource.query<
      {
        user_id: string;
        unplayed_count: number;
        single_content_id: string | null;
        single_title: string | null;
        listened_recently: boolean;
      }[]
    >(
      `select u.id as user_id,
              coalesce(unplayed.count, 0)::int as unplayed_count,
              case when unplayed.count = 1 then unplayed.content_id end as single_content_id,
              case when unplayed.count = 1 then unplayed.title end as single_title,
              exists (
                select 1 from playback_progresses pp
                 where pp.user_id = u.id and pp.updated_at >= $3
              ) as listened_recently
         from users u
         left join lateral (
           select count(*)::int as count,
                  (array_agg(c.id order by li.added_at desc))[1] as content_id,
                  (array_agg(c.title order by li.added_at desc))[1] as title
             from library_items li
             join contents c on c.id = li.content_id
            where li.user_id = u.id
              and li.deleted_at is null
              and li.source in ('drip', 'discovery')
              and li.status = 'unplayed'
              and li.added_at >= $2
              and c.status = 'published'
              and c.market = u.market
         ) unplayed on true
        where u.id = any($1::uuid[])`,
      [params.userIds, params.addedSince, params.listenedSince],
    );

    return rows.map((row) => ({
      userId: row.user_id,
      unplayedCount: Number(row.unplayed_count),
      single:
        row.single_content_id && row.single_title !== null
          ? { contentId: row.single_content_id, title: row.single_title }
          : null,
      listenedRecently: row.listened_recently,
    }));
  }

  /**
   * 시장 집계 — 모집단(이번 주가 끝나기 전 가입 계정 수, 프로필 상위 %와 같다)·이번 주 청취자별 합·지금 듣는 사람 수.
   * 개인별 합은 순위 계산에만 쓰고 바깥으로 user_id 와 함께 내보내지 않는다(숫자 배열만).
   */
  async findMarketFacts(params: {
    market: UserMarket;
    weekDates: string[];
    weekEnd: Date;
    listeningSince: Date;
  }): Promise<{
    population: number;
    weekListenedDesc: number[];
    listenersNow: number;
  }> {
    const [[population], weekly, [now]] = await Promise.all([
      this.dataSource.query<{ count: number }[]>(
        `select count(*)::int as count from users where market = $1 and created_at < $2`,
        [params.market, params.weekEnd],
      ),
      this.dataSource.query<{ sec: number }[]>(
        `select sum(pr.listened_sec)::float8 as sec
           from play_records pr
           join users u on u.id = pr.user_id
          where u.market = $1 and pr.play_date = any($2::date[])
          group by pr.user_id
         having sum(pr.listened_sec) > 0
          order by sec desc`,
        [params.market, params.weekDates],
      ),
      this.dataSource.query<{ count: number }[]>(
        `select count(distinct pp.user_id)::int as count
           from playback_progresses pp
           join users u on u.id = pp.user_id
          where u.market = $1 and pp.updated_at >= $2`,
        [params.market, params.listeningSince],
      ),
    ]);

    return {
      population: population.count,
      weekListenedDesc: weekly.map((row) => Number(row.sec)),
      listenersNow: now.count,
    };
  }
}
