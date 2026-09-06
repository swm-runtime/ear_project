"use client";
import { useCallback, useEffect, useState } from "react";
import { Stat } from "@/components/ui";

/** 서버 상태 탭 — health 핑·로그 파이프 생존·최근 1시간 ERROR 수를 카드로 요약한다 */

const POLL_SEC = 15;

type Status = {
  health: { ok: boolean; status?: number; latencyMs?: number; error?: string };
  pipes: { api: number | null; caddy: number | null };
  errors1h: number | null;
  errorsCapped: boolean;
};

type Metrics = {
  host: {
    load_1m: number; load_5m: number; load_15m: number; cpu_count: number;
    cpu_used_percent: number | null; mem_total_bytes: number; mem_available_bytes: number; uptime_sec: number;
  };
  db: {
    connections: {
      total: number; active: number; idle: number; idle_in_transaction: number;
      waiting: number; longest_active_sec: number; max: number;
    };
    slow_queries: { pid: number; state: string; duration_sec: number; query: string }[];
    cache_hit_ratio: number | null;
    xact_commit: number; xact_rollback: number; deadlocks: number; size_bytes: number;
  };
  measured_at: string;
};

const GiB = 1024 ** 3;
const gb = (bytes: number) => `${(bytes / GiB).toFixed(1)}GB`;

function ago(ts: number | null): string {
  if (ts === null) return "기록 없음";
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}

/** 파이프가 이 시간 넘게 조용하면 주의로 표시 — api는 요청마다 찍히므로 오래 조용하면 이상 신호다 */
const PIPE_STALE_MS = 30 * 60_000;

export function BackendStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/backend-status", { cache: "no-store" });
      const body = (await res.json()) as Status & { message?: string };
      if (!res.ok) { setError(body.message ?? `조회 실패 (${res.status})`); return; }
      setStatus(body);
      setError(null);
      setUpdatedAt(new Date());
    } catch {
      setError("네트워크 오류 — 잠시 후 다시 시도합니다");
    }

    // 자원·DB는 별도 원천(제품 admin API) — 실패해도 위 카드는 계속 뜬다
    try {
      const res = await fetch("/api/backend-metrics", { cache: "no-store" });
      const body = (await res.json()) as Metrics & { message?: string };
      if (!res.ok) { setMetricsError(body.message ?? `조회 실패 (${res.status})`); return; }
      setMetrics(body);
      setMetricsError(null);
    } catch {
      setMetricsError("네트워크 오류 — 잠시 후 다시 시도합니다");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_SEC * 1000);
    return () => clearInterval(id);
  }, [load]);

  if (error) {
    return <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>;
  }
  if (!status) {
    return <p className="text-[13px] text-ink-soft">불러오는 중…</p>;
  }

  const pipeTone = (ts: number | null) =>
    ts === null ? "text-ink-soft" : Date.now() - ts > PIPE_STALE_MS ? "text-amber-600" : "text-ink";

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="API 응답 (/health)"
          value={status.health.ok ? `정상 · ${status.health.latencyMs}ms` : "응답 없음"}
          sub={status.health.ok ? `HTTP ${status.health.status}` : status.health.error ?? "타임아웃/연결 실패"}
          tone={status.health.ok ? "text-brand-ink" : "text-red-600"}
        />
        <Stat
          label="api 로그 파이프"
          value={ago(status.pipes.api)}
          sub={status.pipes.api === null ? "CloudWatch 전환 전이거나 권한 없음" : "마지막 로그 이벤트"}
          tone={pipeTone(status.pipes.api)}
        />
        <Stat
          label="caddy 로그 파이프"
          value={ago(status.pipes.caddy)}
          sub={status.pipes.caddy === null ? "CloudWatch 전환 전이거나 권한 없음" : "마지막 로그 이벤트"}
          tone={pipeTone(status.pipes.caddy)}
        />
        <Stat
          label="최근 1시간 ERROR"
          value={status.errors1h === null ? "조회 불가" : `${status.errors1h}${status.errorsCapped ? "+" : ""}건`}
          sub="api 그룹 · ERROR/FATAL"
          tone={status.errors1h === null ? "text-ink-soft" : status.errors1h > 0 ? "text-red-600" : "text-brand-ink"}
        />
      </div>
      <h2 className="mb-2 mt-6 text-[13px] font-semibold text-ink">자원 · DB 부하</h2>
      {metricsError ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-700">{metricsError}</div>
      ) : !metrics ? (
        <p className="text-[13px] text-ink-soft">불러오는 중…</p>
      ) : (
        <ResourceCards metrics={metrics} />
      )}
      <p className="mt-3 text-[11px] text-ink-soft">
        {POLL_SEC}초마다 자동 갱신{updatedAt ? ` · 마지막 ${updatedAt.toLocaleTimeString("ko-KR", { hour12: false })}` : ""} —
        ERROR가 있으면 에러 모아보기에서 유형을 확인한다
      </p>
    </div>
  );
}

/** CPU 부하는 코어 수 대비 load(1분)로 판정한다 — 코어를 다 쓰면 1.0 */
function ResourceCards({ metrics }: { metrics: Metrics }) {
  const { host, db } = metrics;
  const loadRatio = host.load_1m / Math.max(1, host.cpu_count);
  const memUsedRatio = (host.mem_total_bytes - host.mem_available_bytes) / host.mem_total_bytes;
  const connRatio = db.connections.total / Math.max(1, db.connections.max);
  const warnTone = (ratio: number, warn: number, bad: number) =>
    ratio >= bad ? "text-red-600" : ratio >= warn ? "text-amber-600" : "text-ink";

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="CPU"
          value={host.cpu_used_percent === null ? `load ${host.load_1m.toFixed(2)}` : `${host.cpu_used_percent.toFixed(0)}%`}
          sub={`load ${host.load_1m.toFixed(2)} / ${host.load_5m.toFixed(2)} / ${host.load_15m.toFixed(2)} · ${host.cpu_count}코어`}
          tone={warnTone(host.cpu_used_percent === null ? loadRatio : host.cpu_used_percent / 100, 0.7, 0.9)}
        />
        <Stat
          label="메모리"
          value={`${(memUsedRatio * 100).toFixed(0)}% 사용`}
          sub={`가용 ${gb(host.mem_available_bytes)} / 전체 ${gb(host.mem_total_bytes)}`}
          tone={warnTone(memUsedRatio, 0.8, 0.92)}
        />
        <Stat
          label="DB 연결"
          value={`${db.connections.total} / ${db.connections.max}`}
          sub={`활성 ${db.connections.active} · 유휴 ${db.connections.idle} · 트랜잭션 중 유휴 ${db.connections.idle_in_transaction} · 대기 ${db.connections.waiting}`}
          tone={warnTone(connRatio, 0.6, 0.8)}
        />
        <Stat
          label="DB 캐시 적중률"
          value={db.cache_hit_ratio === null ? "집계 전" : `${(db.cache_hit_ratio * 100).toFixed(1)}%`}
          sub={`크기 ${gb(db.size_bytes)} · 롤백 ${db.xact_rollback.toLocaleString()} · 교착 ${db.deadlocks}`}
          tone={db.cache_hit_ratio !== null && db.cache_hit_ratio < 0.95 ? "text-amber-600" : "text-ink"}
        />
      </div>
      {db.slow_queries.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded border border-line">
          <table className="w-full text-[12px]">
            <thead className="bg-paper-soft text-left text-ink-soft">
              <tr>
                <th className="px-2 py-1 font-medium">진행 중 쿼리 (오래된 순)</th>
                <th className="px-2 py-1 font-medium">상태</th>
                <th className="px-2 py-1 text-right font-medium">경과</th>
              </tr>
            </thead>
            <tbody>
              {db.slow_queries.map((q) => (
                <tr key={q.pid} className="border-t border-line">
                  <td className="max-w-[560px] truncate px-2 py-1 font-mono text-[11px]" title={q.query}>{q.query}</td>
                  <td className="whitespace-nowrap px-2 py-1">{q.state}</td>
                  <td className={`whitespace-nowrap px-2 py-1 text-right ${q.duration_sec > 5 ? "text-red-600" : q.duration_sec > 1 ? "text-amber-600" : ""}`}>
                    {q.duration_sec.toFixed(1)}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
