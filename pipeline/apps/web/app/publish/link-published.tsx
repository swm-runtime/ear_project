"use client";
import { useEffect, useState } from "react";
import { EarContent, listEarContents } from "@/lib/ear";
import { listUnlinkedPublished, markPublished } from "../actions";
import { Panel, btnCls } from "@/components/ui";
import { earErrMsg } from "./ear-connect";

/**
 * 발행 기록 연결 — 0012 이전에 발행돼 backlog.published_content_ref 가 비어 있는 편을 제품 콘텐츠에 잇는다 (2026-09-08).
 * 제목이 같은 제품 콘텐츠를 자동으로 고르되, 확정은 사람이 [연결]을 눌러서 한다. 연결되면 재발행 버튼이 살아난다.
 * 제품 API 는 이 브라우저의 관리자 세션으로만 호출된다.
 */
type Unlinked = { backlog_id: string; title: string; episode_id: string | null; status: string };
const norm = (s: string) => s.normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

export function LinkPublished() {
  const [rows, setRows] = useState<Unlinked[] | null>(null);
  const [contents, setContents] = useState<EarContent[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => void (async () => {
      try {
        const [u, all] = await Promise.all([listUnlinkedPublished(), loadAllPublished()]);
        setRows(u); setContents(all);
        const auto: Record<string, string> = {};
        for (const r of u) {
          const exact = all.find((c) => norm(c.title) === norm(r.title));
          const loose = exact ?? all.find((c) => norm(c.title).includes(norm(r.title).slice(0, 12)) || norm(r.title).includes(norm(c.title).slice(0, 12)));
          if (loose) auto[r.backlog_id] = loose.id;
        }
        setPick(auto);
      } catch (e) { setErr(earErrMsg(e)); }
    })());
  }, []);

  if (rows == null) return err ? <p className="text-[13px] text-rose-700">{err}</p> : null;
  if (rows.length === 0) return null;

  async function link(r: Unlinked) {
    const id = pick[r.backlog_id]; const c = contents.find((x) => x.id === id);
    if (!c) return;
    if (!confirm(`${r.backlog_id} "${r.title}" 을(를) 제품 콘텐츠 "${c.title}" (${c.id.slice(0, 8)}…, v${c.content_version}) 에 연결할까요?`)) return;
    setBusy(r.backlog_id);
    try { await markPublished(r.backlog_id, c.id, c.content_version, c.published_at, { action: "link", episodeId: r.episode_id ?? undefined, note: c.content_version > 1 ? `연결 시점에 이미 v${c.content_version} — 그 전 재발행은 콘솔 밖에서 일어남(제품 audit_logs 참조)` : "0012 이전 발행분 수기 연결" }); setRows((rs) => (rs ?? []).filter((x) => x.backlog_id !== r.backlog_id)); }
    catch (e) { alert(earErrMsg(e)); } finally { setBusy(null); }
  }

  return (
    <Panel title={`발행 기록 연결 — 제품 id 가 없는 발행 ${rows.length}편`}>
      <p className="mb-2 text-[12.5px] text-ink-soft">0012 이전에 발행된 편은 제품 콘텐츠 id 가 기록돼 있지 않아 재발행 버튼이 뜨지 않는다. 제목으로 맞춘 제품 콘텐츠를 확인하고 [연결]을 누르면 backlog 에 id·버전·발행 시각이 기록된다.</p>
      <table className="w-full text-[13px]">
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.backlog_id}>
              <td className="py-2 pr-3 align-top"><div className="font-medium">{r.title}</div><div className="text-[11px] text-ink-soft">{r.backlog_id} · {r.episode_id ?? "-"} · {r.status}</div></td>
              <td className="py-2 pr-3 align-top">
                <select className="w-full max-w-[420px] rounded border border-line px-2 py-1 text-xs" value={pick[r.backlog_id] ?? ""} onChange={(e) => setPick({ ...pick, [r.backlog_id]: e.target.value })}>
                  <option value="">제품 콘텐츠 선택…</option>
                  {contents.map((c) => <option key={c.id} value={c.id}>{c.title} · v{c.content_version} · {c.id.slice(0, 8)}</option>)}
                </select>
              </td>
              <td className="py-2 text-right align-top"><button className={btnCls("primary")} disabled={!pick[r.backlog_id] || busy === r.backlog_id} onClick={() => void link(r)}>{busy === r.backlog_id ? "연결 중…" : "연결"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

async function loadAllPublished(): Promise<EarContent[]> {
  const out: EarContent[] = []; let off = 0;
  for (;;) { const d = await listEarContents("published", off, 50); out.push(...d.items); off += 50; if (off >= d.total || d.items.length === 0) break; }
  return out;
}
