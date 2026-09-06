import { SystemStats } from '../admin.types';

/**
 * 어드민 로그 콘솔 서버 상태 탭 — 자원·DB 부하 스냅샷
 * (changes/pending/admin-api-system-stats.md).
 */
export class AdminSystemStatsResponseDto {
  readonly host: {
    load_1m: number;
    load_5m: number;
    load_15m: number;
    cpu_count: number;
    cpu_used_percent: number | null;
    mem_total_bytes: number;
    mem_available_bytes: number;
    uptime_sec: number;
  };
  readonly db: {
    connections: {
      total: number;
      active: number;
      idle: number;
      idle_in_transaction: number;
      waiting: number;
      longest_active_sec: number;
      max: number;
    };
    slow_queries: {
      pid: number;
      state: string;
      duration_sec: number;
      query: string;
    }[];
    cache_hit_ratio: number | null;
    xact_commit: number;
    xact_rollback: number;
    deadlocks: number;
    size_bytes: number;
  };
  readonly measured_at: string;

  static from(stats: SystemStats): AdminSystemStatsResponseDto {
    return {
      host: {
        load_1m: stats.host.loadOne,
        load_5m: stats.host.loadFive,
        load_15m: stats.host.loadFifteen,
        cpu_count: stats.host.cpuCount,
        cpu_used_percent: stats.host.cpuUsedPercent,
        mem_total_bytes: stats.host.memTotalBytes,
        mem_available_bytes: stats.host.memAvailableBytes,
        uptime_sec: stats.host.uptimeSec,
      },
      db: {
        connections: {
          total: stats.db.connections.total,
          active: stats.db.connections.active,
          idle: stats.db.connections.idle,
          idle_in_transaction: stats.db.connections.idleInTransaction,
          waiting: stats.db.connections.waiting,
          longest_active_sec: stats.db.connections.longestActiveSec,
          max: stats.db.connections.max,
        },
        slow_queries: stats.db.slowQueries.map((entry) => ({
          pid: entry.pid,
          state: entry.state,
          duration_sec: entry.durationSec,
          query: entry.query,
        })),
        cache_hit_ratio: stats.db.cacheHitRatio,
        xact_commit: stats.db.xactCommit,
        xact_rollback: stats.db.xactRollback,
        deadlocks: stats.db.deadlocks,
        size_bytes: stats.db.sizeBytes,
      },
      measured_at: stats.measuredAt.toISOString(),
    };
  }
}
