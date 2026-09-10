"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { Badge, Td } from "@/components/ui";
import { DecideForm, EvidenceDots } from "@/components/decide-form";
import { fmtTime } from "@/lib/format";

/** 소스 풀 목록 — 행을 펼치면 증거·판정 폼이 그 자리에서 열린다 (별도 화면 이동 없이) */
export function DomainRows({ rows, stats }: { rows: any[]; stats: Record<string, { source_count: number; last_swept: string | null; blocked_count?: number; ok_count?: number }> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {rows.map((r) => {
        const isOpen = open === r.id;
        const st = stats[r.id];
        const blocked = /403|차단|Human Verification|봇 검증/.test(r.note ?? "");
        return (
          <Fragment key={r.id}>
            <tr className={`cursor-pointer ${isOpen ? "bg-[#f2fbf9]" : "hover:bg-[#f7f9fb]"}`} onClick={() => setOpen(isOpen ? null : r.id)}>
              <Td className="w-8 text-ink-soft">
                <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
              </Td>
              <Td><Badge value={r.tier} /></Td>
              <Td className="max-w-[20rem] break-all font-medium">{r.domain}</Td>
              <Td className="text-ink-soft">{r.publisher}<div className="text-[11px]">{r.category}</div></Td>
              <Td className="whitespace-nowrap text-xs text-ink-soft">{(r.topic_coverage ?? []).join(" · ")}</Td>
              <Td className="whitespace-nowrap text-xs">
                {r.feed_url ? <span className="text-emerald-700">RSS</span> : <span className="text-ink-soft">모드 B</span>}
                {blocked && <span className="ml-1 text-rose-600">차단 신호</span>}
                <div className="text-[11px] text-ink-soft">{st?.source_count ? `소스 ${st.source_count}건` : "미수집"}{st?.blocked_count ? <span className="ml-1 text-rose-600" title="설계·군집화가 본문을 가져오지 못한 소스 (robots·403). 계층 변경은 사람이 판단">본문 불가 {st.blocked_count}건</span> : null}{r.fetch_blocked_at ? <span className="ml-1 rounded bg-rose-50 px-1 text-rose-700" title="ok 0건·차단 3건 이상 — 사이트 정책으로 본문이 안 열리는 곳. 군집화 풀에서 자동 제외 중. 차단 계층으로 옮기려면 판정 폼에서">군집화 제외</span> : null}</div>
                <EvidenceDots ev={r.evidence} />
              </Td>
              <Td className="whitespace-nowrap text-xs text-ink-soft">{r.decided_by ? <>{r.decided_by}<div className="text-[11px]">{fmtTime(r.decided_at)}</div></> : "-"}</Td>
            </tr>
            {isOpen && (
              <tr className="bg-[#fbfdfe]">
                <td colSpan={7} className="border-t border-line px-4 py-4">
                  <div className="mb-2 flex items-center gap-3 text-xs text-ink-soft">
                    <span>최근 스윕 {st?.last_swept ? fmtTime(st.last_swept) : "-"}</span>
                    {r.license_basis && <span>· 기존 근거: {r.license_basis}</span>}
                    <Link href={`/domains/${r.id}`} className="ml-auto underline" onClick={(e) => e.stopPropagation()}>단독 화면 →</Link>
                  </div>
                  <DecideForm d={r} compact onDone={() => setOpen(null)} />
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
