import Link from "next/link";
import type { ReactNode } from "react";
import { label } from "@/lib/format";

/** 페이지 헤더 — 제목 + 경로 + (우측) 액션 */
export function PageHeader({ title, breadcrumb, actions, desc }: { title: string; breadcrumb?: string[]; actions?: ReactNode; desc?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {desc && <p className="mt-1 max-w-3xl text-[13px] text-ink-soft">{desc}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {breadcrumb && <nav className="ml-2 text-xs text-ink-soft">{breadcrumb.join(" › ")}</nav>}
      </div>
    </div>
  );
}

/** 흰 패널 — 표·폼의 기본 컨테이너 */
export function Panel({ title, right, children, className = "", flush }: { title?: string; right?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`rounded-md border border-line bg-panel shadow-[0_1px_2px_rgba(38,49,61,0.04)] ${className}`}>
      {(title || right) && (
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-[13px] font-semibold text-ink">{title}</h2>}
          <div className="ml-auto flex items-center gap-2">{right}</div>
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/** 툴바 — 주 액션 + 필터 (레퍼런스의 액션 바) */
export function Toolbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {children}
      <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}

const TONE: Record<string, string> = {
  running: "bg-blue-50 text-blue-700 ring-blue-200",
  claimed: "bg-blue-50 text-blue-700 ring-blue-200",
  queued: "bg-amber-50 text-amber-800 ring-amber-200",
  done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  qa_passed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  published: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  allow_open: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  blocked: "bg-rose-50 text-rose-700 ring-rose-200",
  review_required: "bg-rose-50 text-rose-700 ring-rose-200",
  proposed: "bg-violet-50 text-violet-700 ring-violet-200",
  drafted: "bg-sky-50 text-sky-700 ring-sky-200",
  approved: "bg-teal-50 text-teal-700 ring-teal-200",
  held: "bg-slate-100 text-slate-600 ring-slate-200",
  hold: "bg-slate-100 text-slate-600 ring-slate-200",
  // 규칙 자산 상태 (prompt_assets.status — spec/10 3.2)
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  draft: "bg-amber-50 text-amber-800 ring-amber-200",
  retired: "bg-slate-100 text-slate-500 ring-slate-200",
  candidate: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Badge({ value, children, tone }: { value?: string; children?: ReactNode; tone?: string }) {
  const cls = TONE[tone ?? value ?? ""] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>{children ?? label(value)}</span>;
}

/** 표 — 레퍼런스의 데이터 테이블 (헤더 회색, 행 구분선, 호버) */
export function Table({ head, children, empty }: { head: (string | ReactNode)[]; children: ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.flat() : children;
  const isEmpty = Array.isArray(rows) ? rows.filter(Boolean).length === 0 : !rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line bg-[#f7f9fb] text-left text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {isEmpty ? <tr><td colSpan={head.length} className="px-4 py-8 text-center text-ink-soft">{empty ?? "내용이 없습니다"}</td></tr> : rows}
        </tbody>
      </table>
    </div>
  );
}

export function Tr({ children, href }: { children: ReactNode; href?: string }) {
  const cls = "hover:bg-[#f7f9fb]";
  return href ? <tr className={cls}>{children}</tr> : <tr className={cls}>{children}</tr>;
}
export function Td({ children, className = "", colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-4 py-2.5 align-top ${className}`}>{children}</td>;
}

/** 버튼 — 주(brand)·보조(outline)·위험 */
export function btnCls(kind: "primary" | "ghost" | "danger" = "ghost", size: "sm" | "md" = "sm") {
  const base = `inline-flex items-center gap-1.5 rounded font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-[13px]"}`;
  if (kind === "primary") return `${base} bg-brand text-white hover:bg-brand-ink shadow-[0_1px_2px_rgba(22,163,148,0.35)]`;
  if (kind === "danger") return `${base} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`;
  return `${base} border border-line bg-white text-ink hover:bg-[#f7f9fb]`;
}

export function LinkBtn({ href, kind = "ghost", children }: { href: string; kind?: "primary" | "ghost"; children: ReactNode }) {
  return <Link href={href} className={btnCls(kind)}>{children}</Link>;
}

/** 통계 타일 — 대시보드 상단 */
export function Stat({ label: l, value, sub, tone = "text-ink" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3 shadow-[0_1px_2px_rgba(38,49,61,0.04)]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{l}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}
