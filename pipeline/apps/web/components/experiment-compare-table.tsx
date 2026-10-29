import { fmtInt, fmtPct } from "@/lib/insights-format";

/**
 * 실험 비교 표(실험 지표 탭 공용, 2026-10-30) — **열 = 비교 묶음, 행 = 지표**. 묶음끼리 같은 줄에서 나란히 읽히게 한다
 * (종전 "행 = 묶음" 표는 숫자가 작고 차이를 눈으로 빼야 해서 읽기 어려웠다).
 *
 * - 첫 열이 기준이다. 비율 행은 둘째 열부터 기준 대비 차이(%p)를 붙이고, 좋아진 쪽을 초록 · 나빠진 쪽을 빨강으로 칠한다.
 *   "좋아짐"의 방향은 행이 정한다(`better` — 완청률은 높을수록, 이탈률은 낮을수록).
 * - 표본이 작은 묶음은 머리에 배지를 단다 — 그 열의 차이는 흐리게 그린다(우연일 수 있다).
 * - 비율 · 표본 기준은 서버 값이고 이 표는 표시만 한다.
 */
export interface CompareColumn {
  key: string;
  /** 머리 큰 글씨(예: "07:30", "짧은 판") */
  title: string;
  /** 머리 작은 글씨(예: "A 그룹") */
  subtitle?: string;
  /** 표본 작음 배지 */
  smallSample?: boolean;
}

export type CompareRow =
  | {
      kind: "rate";
      label: string;
      /** 높을수록 좋은가(완청률 · 재생률) · 낮을수록 좋은가(이탈률) */
      better: "higher" | "lower";
      /** 열 순서대로 — 비율과 분자(괄호 안 건수, 없으면 생략) */
      cells: { rate: number | null; count?: number }[];
      digits?: number;
    }
  | {
      kind: "count" | "text";
      label: string;
      cells: (number | string | null)[];
    };

const DIFF_EPSILON = 0.0005;

export function ExperimentCompareTable({ columns, rows, caption }: { columns: CompareColumn[]; rows: CompareRow[]; caption?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        {caption && <caption className="pb-1 text-left text-xs text-ink-soft">{caption}</caption>}
        <thead>
          <tr>
            <th className="w-32 border-b border-line py-2 pr-3 text-left text-xs font-normal text-ink-soft" />
            {columns.map((c, i) => (
              <th key={c.key} className={`border-b border-line px-3 py-2 text-right align-bottom ${i === 0 ? "bg-[#f7f9fb]" : ""}`}>
                <div className="text-base font-semibold tabular-nums">{c.title}</div>
                <div className="text-[11px] font-normal text-ink-soft">
                  {i === 0 ? "기준" : c.subtitle ?? ""}
                  {i === 0 && c.subtitle ? ` · ${c.subtitle}` : ""}
                </div>
                {c.smallSample && <span className="mt-0.5 inline-block rounded bg-amber-100 px-1 text-[10px] font-normal text-amber-900">표본 작음</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="border-b border-line py-2 pr-3 text-left text-xs font-normal text-ink-soft">{r.label}</th>
              {r.kind === "rate"
                ? r.cells.map((cell, i) => (
                    <td key={columns[i]?.key ?? i} className={`border-b border-line px-3 py-2 text-right tabular-nums ${i === 0 ? "bg-[#f7f9fb]" : ""}`}>
                      <div className="text-[15px] font-semibold">{fmtPct(cell.rate, r.digits ?? 1)}</div>
                      <div className="text-[11px] text-ink-soft">
                        {i > 0 && <Diff base={r.cells[0]?.rate ?? null} value={cell.rate} better={r.better} muted={!!columns[i]?.smallSample || !!columns[0]?.smallSample} />}
                        {cell.count != null && <span className="ml-1">{fmtInt(cell.count)}건</span>}
                      </div>
                    </td>
                  ))
                : r.cells.map((cell, i) => (
                    <td key={columns[i]?.key ?? i} className={`border-b border-line px-3 py-2 text-right tabular-nums text-[13px] ${i === 0 ? "bg-[#f7f9fb]" : ""}`}>
                      {typeof cell === "number" ? fmtInt(cell) : cell ?? "-"}
                    </td>
                  ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 기준 대비 차이(%p) — 좋아진 쪽 초록 · 나빠진 쪽 빨강 · 표본이 작으면 회색 */
function Diff({ base, value, better, muted }: { base: number | null; value: number | null; better: "higher" | "lower"; muted: boolean }) {
  if (base == null || value == null) return null;
  const diff = value - base;
  if (Math.abs(diff) < DIFF_EPSILON) return <span>±0%p</span>;
  const improved = better === "higher" ? diff > 0 : diff < 0;
  const color = muted ? "text-ink-soft" : improved ? "text-emerald-700" : "text-rose-700";
  return (
    <span className={`font-semibold ${color}`}>
      {diff > 0 ? "+" : "−"}
      {(Math.abs(diff) * 100).toFixed(1)}%p
    </span>
  );
}
