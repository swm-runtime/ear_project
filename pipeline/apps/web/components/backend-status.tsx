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
      <p className="mt-3 text-[11px] text-ink-soft">
        {POLL_SEC}초마다 자동 갱신{updatedAt ? ` · 마지막 ${updatedAt.toLocaleTimeString("ko-KR", { hour12: false })}` : ""} —
        ERROR가 있으면 에러 모아보기에서 유형을 확인한다
      </p>
    </div>
  );
}
