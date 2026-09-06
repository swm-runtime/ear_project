import { readFile } from 'node:fs/promises';
import os from 'node:os';

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  DbConnectionStats,
  DbStats,
  HostStats,
  SlowQueryEntry,
  SystemStats,
} from '../admin.types';

/**
 * 서버 자원·DB 부하 스냅샷 — 어드민 로그 콘솔 서버 상태 탭의 데이터 원천
 * (tickets/backend: 모니터링에 CPU/메모리·DB 부하 추가, 2026-09-06).
 *
 * - 호스트 지표는 `/proc`에서 읽는다. 컨테이너는 커널을 호스트와 공유하므로
 *   `/proc/stat`·`/proc/meminfo`·`loadavg`는 **호스트 전체** 값이다 — API·DB가
 *   같은 EC2에 있는 현 구성에서 원하는 값이 바로 이것이다.
 * - DB 지표는 pg 통계 뷰만 읽는다(current_database 한정). 쓰기 없음.
 * - 느린 쿼리의 query 텍스트는 TypeORM이 파라미터 바인딩($1)을 쓰므로 사용자
 *   데이터가 원문으로 박히지 않지만, 방어적으로 길이를 자른다. 응답은 관리자
 *   가드 뒤에만 나간다.
 */
const CPU_SAMPLE_MS = 300;
const SLOW_QUERY_LIMIT = 5;
const SLOW_QUERY_TEXT_MAX = 150;

@Injectable()
export class AdminSystemStatsService {
  constructor(private readonly dataSource: DataSource) {}

  async snapshot(now: Date): Promise<SystemStats> {
    const [host, db] = await Promise.all([this.readHost(), this.readDb()]);
    return { host, db, measuredAt: now };
  }

  private async readHost(): Promise<HostStats> {
    const [loadOne, loadFive, loadFifteen] = os.loadavg();
    const [cpuUsedPercent, memory] = await Promise.all([
      this.sampleCpuPercent(),
      this.readMeminfo(),
    ]);

    return {
      loadOne,
      loadFive,
      loadFifteen,
      cpuCount: os.cpus().length,
      cpuUsedPercent,
      memTotalBytes: memory.totalBytes,
      memAvailableBytes: memory.availableBytes,
      uptimeSec: Math.round(os.uptime()),
    };
  }

  /** /proc/stat 을 두 번 읽어 구간 CPU 사용률을 만든다. 못 읽으면 null(비 Linux 로컬) */
  private async sampleCpuPercent(): Promise<number | null> {
    try {
      const first = parseProcStatCpu(await readFile('/proc/stat', 'utf8'));
      await new Promise((resolve) => setTimeout(resolve, CPU_SAMPLE_MS));
      const second = parseProcStatCpu(await readFile('/proc/stat', 'utf8'));
      return cpuPercentBetween(first, second);
    } catch {
      return null;
    }
  }

  private async readMeminfo(): Promise<{
    totalBytes: number;
    availableBytes: number;
  }> {
    try {
      const meminfo = parseMeminfo(await readFile('/proc/meminfo', 'utf8'));
      if (meminfo) return meminfo;
    } catch {
      // 비 Linux 로컬 — os 값으로 대체한다
    }
    // os.freemem()은 MemFree라 캐시를 사용 중으로 계산해 과소평가지만, 폴백으로는 충분하다
    return { totalBytes: os.totalmem(), availableBytes: os.freemem() };
  }

  private async readDb(): Promise<DbStats> {
    const [connections, slowQueries, databaseStats, maxConnections] =
      await Promise.all([
        this.readConnections(),
        this.readSlowQueries(),
        this.readDatabaseStats(),
        this.readMaxConnections(),
      ]);

    return {
      connections: { ...connections, max: maxConnections },
      slowQueries,
      ...databaseStats,
    };
  }

  private async readConnections(): Promise<Omit<DbConnectionStats, 'max'>> {
    const [row] = (await this.dataSource.query(
      `select count(*)::int as total,
              count(*) filter (where state = 'active')::int as active,
              count(*) filter (where state = 'idle')::int as idle,
              count(*) filter (where state like 'idle in transaction%')::int as idle_in_transaction,
              count(*) filter (where state = 'active' and wait_event_type is not null)::int as waiting,
              coalesce(max(extract(epoch from now() - query_start))
                filter (where state = 'active' and pid <> pg_backend_pid()), 0)::float as longest_active_sec
         from pg_stat_activity
        where datname = current_database()`,
    )) as [
      {
        total: number;
        active: number;
        idle: number;
        idle_in_transaction: number;
        waiting: number;
        longest_active_sec: number;
      },
    ];

    return {
      total: row.total,
      active: row.active,
      idle: row.idle,
      idleInTransaction: row.idle_in_transaction,
      waiting: row.waiting,
      longestActiveSec: row.longest_active_sec,
    };
  }

  private async readSlowQueries(): Promise<SlowQueryEntry[]> {
    const rows = (await this.dataSource.query(
      `select pid::int as pid,
              state,
              coalesce(extract(epoch from now() - query_start), 0)::float as duration_sec,
              left(query, $1) as query
         from pg_stat_activity
        where datname = current_database()
          and state <> 'idle'
          and pid <> pg_backend_pid()
        order by query_start asc nulls last
        limit $2`,
      [SLOW_QUERY_TEXT_MAX, SLOW_QUERY_LIMIT],
    )) as { pid: number; state: string; duration_sec: number; query: string }[];

    return rows.map((row) => ({
      pid: row.pid,
      state: row.state,
      durationSec: row.duration_sec,
      query: row.query,
    }));
  }

  private async readDatabaseStats(): Promise<
    Pick<
      DbStats,
      'cacheHitRatio' | 'xactCommit' | 'xactRollback' | 'deadlocks' | 'sizeBytes'
    >
  > {
    const [row] = (await this.dataSource.query(
      `select xact_commit::bigint as xact_commit,
              xact_rollback::bigint as xact_rollback,
              blks_read::bigint as blks_read,
              blks_hit::bigint as blks_hit,
              deadlocks::bigint as deadlocks,
              pg_database_size(current_database())::bigint as size_bytes
         from pg_stat_database
        where datname = current_database()`,
    )) as [
      {
        xact_commit: string;
        xact_rollback: string;
        blks_read: string;
        blks_hit: string;
        deadlocks: string;
        size_bytes: string;
      },
    ];

    const blksRead = Number(row.blks_read);
    const blksHit = Number(row.blks_hit);
    const blksTotal = blksRead + blksHit;

    return {
      // 통계 리셋 이후 누적 기준 — 정상 서비스면 0.99 이상이 보통이다
      cacheHitRatio: blksTotal === 0 ? null : blksHit / blksTotal,
      xactCommit: Number(row.xact_commit),
      xactRollback: Number(row.xact_rollback),
      deadlocks: Number(row.deadlocks),
      sizeBytes: Number(row.size_bytes),
    };
  }

  private async readMaxConnections(): Promise<number> {
    const [row] = (await this.dataSource.query(`show max_connections`)) as [
      { max_connections: string },
    ];
    return Number(row.max_connections);
  }
}

/** `cpu  user nice system idle iowait ...` 집계 행 → 누적 틱 */
export function parseProcStatCpu(procStat: string): {
  idle: number;
  total: number;
} {
  const line = procStat.split('\n').find((row) => row.startsWith('cpu '));
  if (!line) throw new Error('cpu 집계 행 없음');

  const ticks = line.trim().split(/\s+/).slice(1).map(Number);
  // idle(3) + iowait(4)을 유휴로 본다 — iowait 중 CPU는 놀고 있다
  const idle = ticks[3] + (ticks[4] ?? 0);
  const total = ticks.reduce((sum, tick) => sum + tick, 0);

  return { idle, total };
}

/** 두 스냅샷 사이 구간 사용률(%). 구간이 0이면(가상화 시계 문제) null */
export function cpuPercentBetween(
  first: { idle: number; total: number },
  second: { idle: number; total: number },
): number | null {
  const totalDelta = second.total - first.total;
  if (totalDelta <= 0) return null;

  const idleDelta = second.idle - first.idle;
  return Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100));
}

/** MemTotal·MemAvailable(kB) — 캐시 회수분을 반영한 실제 가용량이다 */
export function parseMeminfo(
  meminfo: string,
): { totalBytes: number; availableBytes: number } | null {
  const read = (key: string): number | null => {
    const match = meminfo.match(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm'));
    return match ? Number(match[1]) * 1024 : null;
  };

  const totalBytes = read('MemTotal');
  const availableBytes = read('MemAvailable');
  if (totalBytes === null || availableBytes === null) return null;

  return { totalBytes, availableBytes };
}
