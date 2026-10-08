"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * 에러 모아보기 — /api/backend-logs?mode=errors 로 ERROR(·WARN)만 걷어와
 * **같은 유형끼리 묶어서** 건수·최근 발생 순으로 보여준다.
 *
 * 묶는 기준(시그니처): 메시지에서 매번 달라지는 부분(숫자·uuid·해시·따옴표 값)을 지운
 * 나머지 골격. 완벽한 분류가 아니라 "무슨 에러가 몇 번"을 한눈에 보기 위한 근사다.
 *
 * 서버는 창을 **최신부터** 조각내 모으고 상한(이벤트 3,000·왕복 40)에 걸리면 멈춘다
 * (`lib/backend-error-collect.ts`). 그래서 응답의 `coveredFrom`·`exhausted` 로 "창 전체를 봤다" 또는
 * "상한에 걸려 어느 시각 이후만 봤다"를 상단에 밝힌다 — 안 밝히면 잘린 창이 온전한 창으로 읽힌다.
 */

const GROUPS = [
  { key: "api", label: "api (NestJS)" },
  { key: "caddy", label: "caddy (접근 로그)" },
];
const RANGES = [
  { minutes: 360, label: "6시간" },
  { minutes: 1440, label: "24시간" },
  { minutes: 4320, label: "3일" },
  { minutes: 10080, label: "7일" },
];

type LogEvent = { t: number; message: string };
/** 서버가 창을 어디까지 봤는가 — 상단 문구의 근거 */
type Coverage = { coveredFrom: number; windowFrom: number; exhausted: boolean; pages: number };
type ErrorGroup = {
  signature: string;
  level: "error" | "warn";
  count: number;
  lastSeen: number;
  samples: LogEvent[];
};

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour12: false,
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** 가변 부분을 지워 같은 유형을 한 줄로 접는다 */
function signatureOf(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hash>")
    .replace(/"[^"]{0,120}"/g, '"…"')
    .replace(/\b\d+(\.\d+)?(ms|s|%)?\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

function levelOf(message: string): "error" | "warn" {
  return /\b(ERROR|FATAL)\b|"level":"error"/i.test(message) ? "error" : "warn";
}

export function BackendErrorSummary() {
  const [group, setGroup] = useState("api");
  const [minutes, setMinutes] = useState(1440);
  const [withWarn, setWithWarn] = useState(false);
  const [groups, setGroups] = useState<ErrorGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSig, setOpenSig] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/backend-logs?mode=errors&group=${group}&minutes=${minutes}&warn=${withWarn ? "1" : "0"}`,
        { cache: "no-store" },
      );
      const body = (await res.json()) as Partial<Coverage> & { events?: LogEvent[]; message?: string };
      if (!res.ok) { setError(body.message ?? `조회 실패 (${res.status})`); return; }

      const bySig = new Map<string, ErrorGroup>();
      for (const e of body.events ?? []) {
        const signature = signatureOf(e.message);
        const found = bySig.get(signature);
        if (found) {
          found.count += 1;
          found.lastSeen = Math.max(found.lastSeen, e.t);
          if (found.samples.length < 5) found.samples.push(e);
        } else {
          bySig.set(signature, { signature, level: levelOf(e.message), count: 1, lastSeen: e.t, samples: [e] });
        }
      }
      setGroups([...bySig.values()].sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen));
      setTotal((body.events ?? []).length);
      setCoverage(
        body.windowFrom !== undefined && body.coveredFrom !== undefined
          ? { coveredFrom: body.coveredFrom, windowFrom: body.windowFrom, exhausted: body.exhausted === true, pages: body.pages ?? 0 }
          : null,
      );
      setError(null);
    } catch {
      setError("네트워크 오류 — 잠시 후 다시 시도하세요");
    } finally {
      setLoading(false);
    }
  }, [group, minutes, withWarn]);

  // 열 때·조건이 바뀔 때 1회 불러온다 — load 가 먼저 "불러오는 중"을 켜서 규칙에 걸리지만 그게 목적이다
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const chip = (active: boolean) =>
    `rounded border px-2 py-1 text-xs ${active ? "border-ink bg-panel font-medium" : "border-line bg-panel text-ink-soft hover:text-ink"}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex gap-1">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" className={chip(group === g.key)} onClick={() => setGroup(g.key)}>{g.label}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.minutes} type="button" className={chip(minutes === r.minutes)} onClick={() => setMinutes(r.minutes)}>{r.label}</button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-ink-soft">
          <input type="checkbox" checked={withWarn} onChange={(e) => setWithWarn(e.target.checked)} />
          WARN 포함
        </label>
        <button type="button" className={chip(false)} onClick={() => void load()}>새로고침</button>
        <span className="ml-auto text-ink-soft">
          {loading ? "불러오는 중…" : `유형 ${groups.length}개 · 발생 ${total}건`}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>
      )}

      {!loading && !error && coverage && (
        coverage.exhausted ? (
          <p className="mb-3 text-[12px] text-ink-soft">
            창 전체({timeFmt.format(new Date(coverage.windowFrom))} 이후)를 다 봤습니다 · CloudWatch 조회 {coverage.pages}회
          </p>
        ) : (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            수집 상한에 걸려 <b>{timeFmt.format(new Date(coverage.coveredFrom))} 이후</b>만 전부 봤습니다 — 그 이전은 일부만 들어
            있습니다(조회 {coverage.pages}회). 기간을 줄이면 창 전체를 볼 수 있습니다.
          </div>
        )
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="rounded border border-line bg-panel px-4 py-8 text-center text-[13px] text-ink-soft">
          이 범위에 {withWarn ? "ERROR·WARN" : "ERROR"} 로그가 없습니다 🎉
        </div>
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.signature} className="overflow-hidden rounded border border-line bg-panel">
            <button
              type="button"
              onClick={() => setOpenSig(openSig === g.signature ? null : g.signature)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#f7f9fb]"
            >
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${g.level === "error" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                {g.level === "error" ? "ERROR" : "WARN"}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{g.signature}</span>
              <span className="shrink-0 rounded-full bg-[#eef1f4] px-2 py-0.5 text-[11px] font-semibold text-ink">{g.count}건</span>
              <span className="shrink-0 text-[11px] text-ink-soft">최근 {timeFmt.format(new Date(g.lastSeen))}</span>
            </button>
            {openSig === g.signature && (
              <div className="border-t border-line bg-side px-3 py-2 font-mono text-[12px] leading-relaxed text-[#c9d4de]">
                {g.samples.map((s, i) => (
                  <div key={`${s.t}-${i}`} className="flex gap-2 whitespace-pre-wrap break-all">
                    <span className="shrink-0 select-none text-side-ink">{timeFmt.format(new Date(s.t))}</span>
                    <span>{s.message}</span>
                  </div>
                ))}
                {g.count > g.samples.length && (
                  <p className="mt-1 text-[11px] text-side-ink">…외 {g.count - g.samples.length}건 — 원문 전체는 실시간 로그에서 필터로 확인</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
