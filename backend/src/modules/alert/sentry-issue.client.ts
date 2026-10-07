import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

/** Slack 문구에 싣는 이슈 단위 값 — 이벤트 웹훅에는 없고 Issue API 에만 있는 것 */
export interface SentryIssueSummary {
  /** `EAR-API-1A` 같은 짧은 id */
  shortId: string | null;
  /** `new` · `regressed` · `ongoing` · `escalating` … (Sentry `substatus`), 없으면 `status`(`unresolved` 등) */
  state: string | null;
  firstSeen: Date | null;
  lastSeen: Date | null;
  /** 발생 건수(이슈 누적) */
  count: number | null;
  /** 영향 사용자 수 — 숫자만 싣는다. 누구인지는 꺼내지 않는다 */
  userCount: number | null;
}

const SENTRY_API_BASE = 'https://sentry.io/api/0';
/** 알림을 늦추지 않는 상한 — 넘기면 이슈 정보 없이 보낸다 */
const SENTRY_API_TIMEOUT_MS = 3_000;

/**
 * Sentry Issue API 조회(`GET /api/0/issues/{id}/`) — 중계 문구에 State · First Seen · 건수를 붙이기 위해
 * (`backend-monitoring.md` 3-2, 2026-10-07). Sentry 의 Slack 통합이 내부에서 하던 조회를 우리가 대신한다.
 *
 * 토큰은 웹훅을 보내는 그 Internal Integration 의 토큰(`SENTRY_API_TOKEN`, 권한 Issue & Event: Read). 비어 있으면
 * 꺼진 것이고 `fetch`는 `null` — 호출부는 그래도 알림을 보낸다. 실패·지연도 같다: 이 조회 때문에 알림이 빠지거나
 * 늦어지면 안 된다. 응답에서 **사용자 식별값은 꺼내지 않는다**(`userCount` 숫자만).
 */
@Injectable()
export class SentryIssueClient {
  private readonly logger = new Logger(SentryIssueClient.name);
  private readonly token: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.token =
      configService.get('SENTRY_API_TOKEN', { infer: true })?.trim() ?? '';
  }

  get enabled(): boolean {
    return this.token !== '';
  }

  async fetch(issueId: string): Promise<SentryIssueSummary | null> {
    if (!this.enabled) return null;

    try {
      const response = await globalThis.fetch(
        `${SENTRY_API_BASE}/issues/${encodeURIComponent(issueId)}/`,
        {
          headers: { authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(SENTRY_API_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        this.logger.warn('sentry issue lookup failed', {
          issue_id: issueId,
          status: response.status,
        });
        return null;
      }

      return normalizeIssue((await response.json()) as unknown);
    } catch (error) {
      this.logger.warn('sentry issue lookup failed', {
        issue_id: issueId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function asCount(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

function asDate(value: unknown): Date | null {
  const s = asString(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Issue API 응답에서 쓰는 것만. 모양이 어긋나면 그 값만 `null` */
export function normalizeIssue(body: unknown): SentryIssueSummary | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const issue = body as Record<string, unknown>;

  return {
    shortId: asString(issue.shortId),
    state: asString(issue.substatus) ?? asString(issue.status),
    firstSeen: asDate(issue.firstSeen),
    lastSeen: asDate(issue.lastSeen),
    count: asCount(issue.count),
    userCount: asCount(issue.userCount),
  };
}
