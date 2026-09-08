import Link from "next/link";
import type { Problem, Stage } from "@/lib/stages";

/**
 * 가로 진행 트래커 — 파이프라인 7단계를 한 줄로 늘어놓고 진행한 만큼 채운다 (2026-09-08 박수헌 요청).
 * 색: 완료=brand · 진행 중=brand 연함(깜빡임) · 실패=rose · 주의=amber · 대기=연회색 · 해당 없음=투명.
 * 폭은 고정(260px)이고 칸 아래에는 단계 이름만 — 사유·메모는 title(툴팁)과 옆 열 "막힌 곳 · 다음 행동"이 맡는다
 * (같은 날 수정: 칸 아래 설명 때문에 가로 스크롤이 생기던 문제). 서버 컴포넌트 — 훅 없음.
 */
const BAR: Record<Stage["state"], string> = {
  done: "bg-brand",
  running: "bg-brand/45 animate-pulse",
  failed: "bg-rose-500",
  warn: "bg-amber-400",
  pending: "bg-slate-200",
  skip: "bg-slate-100",
};
const TEXT: Record<Stage["state"], string> = {
  done: "text-ink", running: "text-brand-ink", failed: "text-rose-700 font-medium", warn: "text-amber-800 font-medium", pending: "text-ink-soft", skip: "text-slate-300",
};

export function StageTrack({ stages }: { stages: Stage[] }) {
  return (
    <div className="flex w-[260px] shrink-0 gap-[3px]" role="list" aria-label="진행 단계">
      {stages.map((s) => (
        <div key={s.key} role="listitem" className="min-w-0 flex-1" title={`${s.label}${s.note ? ` — ${s.note}` : ""}`}>
          <div className={`h-1.5 rounded-sm ${BAR[s.state]}`} />
          <div className={`mt-0.5 truncate text-center text-[10px] leading-tight ${TEXT[s.state]}`}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

const PROBLEM: Record<Problem["tone"], string> = {
  failed: "border-rose-200 bg-rose-50 text-rose-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-line bg-[#f7f9fb] text-ink-soft",
};

/** 막힌 단계의 사유와 다음 행동 한 줄 — 없으면 아무것도 그리지 않는다 */
export function ProblemLine({ p }: { p: Problem | null }) {
  if (!p) return null;
  return (
    <div className={`inline-flex max-w-full items-start gap-2 rounded border px-2 py-1 text-[11.5px] leading-snug ${PROBLEM[p.tone]}`}>
      <span className="shrink-0 font-semibold">{p.stage}</span>
      <span className="min-w-0 break-words">{p.text}</span>
      {p.href && p.action && <Link href={p.href} className="shrink-0 whitespace-nowrap underline">{p.action} →</Link>}
    </div>
  );
}
