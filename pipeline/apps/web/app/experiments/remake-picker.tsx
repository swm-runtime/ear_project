"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { btnCls, Badge, Table, Td } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { requestRemakes } from "./actions";

export interface OriginalRow { id: string; title: string; mid_topic: string; published_at: string | null; episode_id: string | null; remake: { id: string; status: string } | null; queued: boolean }

/** 발행된 단편 목록 + 체크 → [짧게 다시 만들기]. 이미 짧은 판이 있거나 큐에 든 편은 체크할 수 없다 */
export function RemakePicker({ rows }: { rows: OriginalRow[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const selectable = rows.filter((r) => !r.remake && !r.queued);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = (ids: string[]) => start(async () => {
    setMsg(null);
    const r = await requestRemakes(ids);
    if (!r.ok) { setMsg(`실패: ${r.reason}`); return; }
    setMsg(`요청 ${r.queued.length}편${r.skipped.length ? ` · 건너뜀 ${r.skipped.map((s) => `${s.id}(${s.why})`).join(", ")}` : ""}`);
    setSel(new Set());
  });
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <button className={btnCls()} disabled={pending || !selectable.length} onClick={() => setSel(new Set(selectable.map((r) => r.id)))}>보이는 편 전부 선택 ({selectable.length})</button>
        <button className={btnCls()} disabled={pending || !sel.size} onClick={() => setSel(new Set())}>선택 해제</button>
        <button className={btnCls("primary")} disabled={pending || !sel.size} onClick={() => { if (confirm(`${sel.size}편의 짧은 판(5~12분)을 만듭니다 — 편마다 설계·대본·QA·비평·TTS 가 돌아갑니다. 계속할까요?`)) run([...sel]); }}>선택한 {sel.size}편 짧게 다시 만들기</button>
        {msg && <span className="text-ink-soft">{msg}</span>}
      </div>
      <Table head={["", "원본", "주제", "발행", "짧은 판", ""]} empty="조건에 맞는 발행 편이 없다">
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-[#f7f9fb]">
            <Td className="w-6"><input type="checkbox" disabled={!!r.remake || r.queued || pending} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></Td>
            <Td className="min-w-[280px]">
              <div className="flex flex-col gap-0.5">
                {r.episode_id ? <Link href={`/episodes/${r.episode_id}`} className="font-medium text-ink hover:underline">{r.title}</Link> : <span className="font-medium text-ink">{r.title}</span>}
                <span className="font-mono text-[11px] text-ink-soft">{r.id}{r.episode_id ? ` · ${r.episode_id}` : ""}</span>
              </div>
            </Td>
            <Td>{r.mid_topic}</Td>
            <Td className="whitespace-nowrap text-ink-soft">{fmtTime(r.published_at)}</Td>
            <Td>{r.remake ? <span className="inline-flex items-center gap-1"><Link href={`/backlog?q=${r.remake.id}`} className="font-mono text-brand-ink">{r.remake.id}</Link><Badge value={r.remake.status} /></span> : r.queued ? <Badge tone="running">요청됨</Badge> : <span className="text-ink-soft">없음</span>}</Td>
            <Td>{!r.remake && !r.queued && <button className={btnCls()} disabled={pending} onClick={() => { if (confirm(`${r.id} "${r.title}" 의 짧은 판을 만듭니다.`)) run([r.id]); }}>짧게 다시 만들기</button>}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
