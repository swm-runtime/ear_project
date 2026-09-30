import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { EnvironmentVariables } from '@/config/env.validation';
import { EMBEDDING_MODEL_ID } from '@/modules/content/content.constant';
import {
  ALL_TIME_PERIOD_START,
  StatsPeriodType,
} from '@/modules/content/content.enum';

import {
  EVAL_SNAPSHOT_SCHEMA_VERSION,
  EvalSnapshot,
  EvalSnapshotContent,
  EvalSnapshotUser,
} from './recommend-eval.types';

export const SNAPSHOT_DEFAULT_MAX_USERS = 300;
export const SNAPSHOT_MAX_USERS = 1000;
export const SNAPSHOT_DEFAULT_SIGNAL_DAYS = 365;

/**
 * 추천 평가 스냅샷 내보내기(`admin-api.md` 4.18, `backend/recommendation-evaluation.md` 3.1).
 *
 * **읽기 전용 원시 SQL**이다 — `DailyMetricsDbService`와 같은 방식. 여섯 모듈의 표를 한 번에 읽는 조회라 각 모듈의
 * Service를 거치면 N+1이 되고, 익명화(사용자 id → 일련 키)는 어느 모듈의 규칙도 아니다. 어떤 표도 쓰지 않는다.
 *
 * 사용자는 온보딩을 마친 미탈퇴 사용자를 가입 순으로 `max_users`명까지. 응답에 `users.id`·이메일·닉네임을 싣지 않는다.
 */
@Injectable()
export class RecommendEvalSnapshotService {
  private readonly environment: string;

  constructor(
    private readonly dataSource: DataSource,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.environment =
      configService.get('SENTRY_ENVIRONMENT', { infer: true }) ?? '';
  }

  async export(
    options: { maxUsers: number; signalDays: number },
    now: Date,
  ): Promise<EvalSnapshot> {
    const since = new Date(
      now.getTime() - options.signalDays * 24 * 60 * 60 * 1000,
    );
    const [plans, topics, contents, users] = await Promise.all([
      this.loadPlans(),
      this.loadTopics(),
      this.loadContents(),
      this.loadUsers(options.maxUsers, since),
    ]);

    return {
      schema_version: EVAL_SNAPSHOT_SCHEMA_VERSION,
      exported_at: now.toISOString(),
      environment: this.environment,
      embedding_model: EMBEDDING_MODEL_ID,
      plans,
      topics,
      contents,
      users,
    };
  }

  private async loadPlans(): Promise<EvalSnapshot['plans']> {
    return this.dataSource.query<EvalSnapshot['plans']>(
      `select tier, daily_drip_count, daily_discovery_count
         from plans where is_active = true order by tier`,
    );
  }

  private async loadTopics(): Promise<EvalSnapshot['topics']> {
    return this.dataSource.query<EvalSnapshot['topics']>(
      `select id, name, is_visible from topics order by id`,
    );
  }

  private async loadContents(): Promise<EvalSnapshotContent[]> {
    const rows = await this.dataSource.query<
      (Omit<EvalSnapshotContent, 'embedding' | 'topic_ids'> & {
        topic_ids: string[] | null;
        embedding: string | null;
      })[]
    >(
      `select c.id, c.title, c.author_name, c.source_name, c.duration_sec,
              c.published_at, c.difficulty, c.format, c.is_evergreen, c.keywords,
              c.target_audiences, c.series_id, c.episode_no, c.status, c.license_expires_at,
              coalesce((select array_agg(ct.topic_id order by ct.topic_id)
                          from content_topics ct where ct.content_id = c.id), '{}') as topic_ids,
              coalesce(s.play_count, 0)::int as play_count,
              coalesce(s.complete_count, 0)::int as complete_count,
              e.embedding
         from contents c
         left join content_stats s
           on s.content_id = c.id and s.period_type = $1 and s.period_start = $2
         left join content_embeddings e
           on e.content_id = c.id and e.model = $3 and e.content_version = c.content_version
        where c.status = 'published'
        order by c.published_at, c.id`,
      [StatsPeriodType.ALL, ALL_TIME_PERIOD_START, EMBEDDING_MODEL_ID],
    );

    return rows.map((row) => ({
      ...row,
      published_at: toIso(row.published_at)!,
      license_expires_at: toIso(row.license_expires_at),
      topic_ids: row.topic_ids ?? [],
      // pgvector 텍스트('[0.1, …]') → 숫자 배열. 표시용이 아니라 계산 입력이므로 자르지 않는다
      embedding:
        row.embedding === null ? null : (JSON.parse(row.embedding) as number[]),
    }));
  }

  private async loadUsers(
    maxUsers: number,
    since: Date,
  ): Promise<EvalSnapshotUser[]> {
    const users = await this.dataSource.query<
      {
        id: string;
        tier: string;
        job_category: string | null;
        years_of_experience: number | null;
        auto_expand_enabled: boolean | null;
      }[]
    >(
      `select u.id, u.tier, u.job_category, u.years_of_experience,
              st.is_auto_expand_enabled as auto_expand_enabled
         from users u
         left join user_settings st on st.user_id = u.id
        where u.withdrawn_at is null and u.onboarding_completed = true
        order by u.created_at, u.id
        limit $1`,
      [maxUsers],
    );

    if (users.length === 0) {
      return [];
    }

    const ids = users.map((user) => user.id);
    const [interests, signals, library, excluded] = await Promise.all([
      this.dataSource.query<
        {
          user_id: string;
          topic_id: string;
          source: string;
          is_active: boolean;
          is_user_removed: boolean;
          updated_at: Date;
        }[]
      >(
        `select user_id, topic_id, source, is_active, is_user_removed, updated_at
           from user_interests where user_id = any($1::uuid[]) order by created_at`,
        [ids],
      ),
      this.dataSource.query<
        {
          user_id: string;
          content_id: string;
          action: string;
          created_at: Date;
        }[]
      >(
        `select user_id, content_id, action, created_at
           from user_signals where user_id = any($1::uuid[]) and created_at >= $2
          order by created_at`,
        [ids, since],
      ),
      this.dataSource.query<
        {
          user_id: string;
          content_id: string;
          source: string;
          status: string;
          added_at: Date;
          completed_at: Date | null;
          deleted_at: Date | null;
        }[]
      >(
        `select user_id, content_id, source, status, added_at, completed_at, deleted_at
           from library_items where user_id = any($1::uuid[]) order by added_at`,
        [ids],
      ),
      this.dataSource.query<
        { user_id: string; content_id: string; excluded_at: Date }[]
      >(
        `select user_id, content_id, excluded_at
           from drip_excluded_contents where user_id = any($1::uuid[]) order by excluded_at`,
        [ids],
      ),
    ]);

    const group = <T extends { user_id: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();

      for (const row of rows) {
        const list = map.get(row.user_id) ?? [];
        list.push(row);
        map.set(row.user_id, list);
      }

      return map;
    };
    const interestsBy = group(interests);
    const signalsBy = group(signals);
    const libraryBy = group(library);
    const excludedBy = group(excluded);

    // 익명 키 — 가입 순 일련번호. 응답 어디에도 `users.id`를 싣지 않는다
    return users.map((user, index) => ({
      key: `u${String(index + 1).padStart(3, '0')}`,
      tier: user.tier,
      job_category: user.job_category,
      years_of_experience: user.years_of_experience,
      auto_expand_enabled: user.auto_expand_enabled ?? true,
      interests: (interestsBy.get(user.id) ?? []).map((row) => ({
        topic_id: row.topic_id,
        source: row.source,
        is_active: row.is_active,
        is_user_removed: row.is_user_removed,
        updated_at: toIso(row.updated_at)!,
      })),
      signals: (signalsBy.get(user.id) ?? []).map((row) => ({
        content_id: row.content_id,
        action: row.action,
        created_at: toIso(row.created_at)!,
      })),
      library: (libraryBy.get(user.id) ?? []).map((row) => ({
        content_id: row.content_id,
        source: row.source,
        status: row.status,
        added_at: toIso(row.added_at)!,
        completed_at: toIso(row.completed_at),
        deleted_at: toIso(row.deleted_at),
      })),
      excluded: (excludedBy.get(user.id) ?? []).map((row) => ({
        content_id: row.content_id,
        created_at: toIso(row.excluded_at)!,
      })),
    }));
  }
}

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
