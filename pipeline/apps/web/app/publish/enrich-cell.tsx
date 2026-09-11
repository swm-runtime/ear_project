"use client";
import { useState } from "react";
import { EarContent, ENRICHMENT_SCHEMA_VERSION_FALLBACK, republishEarContent } from "@/lib/ear";
import { readEnrichment, requestEnrich } from "../actions";
import { Badge, btnCls } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { earErrMsg } from "./ear-connect";

export type EnrichState = { status: string; error: string | null; at: string | null; ready: boolean };
export const isStale = (c: EarContent) => c.enrichment_schema_version == null || c.enrichment_schema_version < ENRICHMENT_SCHEMA_VERSION_FALLBACK;

/** 추천 메타 배지 — 없음(null) · 구형 vN · vN(현행). KAN-54 */
export function EnrichBadge({ c }: { c: EarContent }) {
  const v = c.enrichment_schema_version;
  if (v == null) return <Badge tone="queued">메타 없음</Badge>;
  if (v < ENRICHMENT_SCHEMA_VERSION_FALLBACK) return <Badge tone="queued">구형 v{v}</Badge>;
  return <Badge tone="done">v{v}</Badge>;
}

/** 재부여 상태·동작 — [다시 뽑기] → 워커 → [반영](enrichment_file 단독 PATCH). KAN-53 */
export function EnrichCell({ c, st, jobCategories, onChange }: { c: EarContent; st?: EnrichState; jobCategories: string[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const item = { content_id: c.id, title: c.title, description: c.description, topic_names: c.topics.map((t) => t.name), origin: c.origin };
  const running = st && ["queued", "claimed", "running"].includes(st.status);
  async function extract() {
    setBusy(true); setMsg(null);
    try { const r = await requestEnrich([item], jobCategories); setMsg({ ok: true, text: r.queued ? "다시 뽑기 요청됨 — 워커가 집으면 1~2분" : "이미 진행 중" }); onChange(); } catch (e) { setMsg({ ok: false, text: earErrMsg(e) }); } finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setMsg(null);
    try {
      const text = await readEnrichment(c.id);
      if (!text) throw new Error("산출물이 없어요 — 먼저 [다시 뽑기]");
      const file = new File([text], "enrichment.json", { type: "application/json" });
      const r = await republishEarContent(c.id, { enrichment: file }); // enrichment_file 단독 — 버전 무변경·재생 위치 보존 (admin-api 4.10)
      if (r.enrichment_applied) setMsg({ ok: true, text: `반영됨 — v${r.enrichment_schema_version} · 콘텐츠 버전 ${r.content_version} 그대로` });
      else setMsg({ ok: false, text: `거부됨: ${r.enrichment_rejected_reason ?? "사유 없음"}` });
      onChange();
    } catch (e) { setMsg({ ok: false, text: earErrMsg(e) }); } finally { setBusy(false); }
  }
  return (
    <div className="leading-tight">
      <div className="flex items-center gap-1.5">
        <EnrichBadge c={c} />
        {running && <span className="text-[10.5px] text-blue-700">{st!.status === "queued" ? "대기" : "판정 중"}</span>}
        {st?.status === "failed" && <span className="text-[10.5px] text-rose-700" title={st.error ?? ""}>실패</span>}
      </div>
      {c.enriched_at && <div className="text-[10.5px] text-ink-soft">{fmtTime(c.enriched_at)}</div>}
      <div className="mt-1 flex gap-1">
        {!running && <button className={btnCls()} disabled={busy} onClick={() => void extract()} title="대본으로 메타 5종을 다시 판정해 산출물을 만든다 (제품 반영은 [반영])">다시 뽑기</button>}
        {st?.ready && !running && <button className={btnCls("primary")} disabled={busy} onClick={() => void apply()} title="enrichment_file 만 보낸다 — 콘텐츠 버전은 오르지 않고 재생 위치가 보존된다">반영</button>}
      </div>
      {msg && <div className={`mt-1 text-[10.5px] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</div>}
    </div>
  );
}
