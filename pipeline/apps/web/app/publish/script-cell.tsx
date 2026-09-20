"use client";
import { useState } from "react";
import { EarContent, republishEarContent } from "@/lib/ear";
import { readScriptSegments, requestScriptAlign } from "../actions";
import { Badge, btnCls } from "@/components/ui";
import { earErrMsg } from "./ear-connect";

export type ScriptState = { status: string; error: string | null; episode_id: string | null; ready: boolean };

/**
 * 자막 세그먼트 셀 (KAN-72 소급, spec/06 7장) — [자막 뽑기] → 워커 script_align(강제 정렬, 오디오 그대로) → [반영](script_file 단독 PATCH, 버전 무변경).
 * 에피소드가 연결되지 않은 콘텐츠(수동 업로드)는 대본이 없어 뽑을 수 없다.
 */
export function ScriptCell({ c, st, onChange }: { c: EarContent; st?: ScriptState; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const running = st && ["queued", "claimed", "running"].includes(st.status);
  async function extract() {
    setBusy(true); setMsg(null);
    try { const r = await requestScriptAlign([c.id]); setMsg({ ok: r.queued > 0, text: r.queued ? "정렬 요청됨 — 서버 워커가 집으면 1~2분" : r.noEpisode ? "연결된 에피소드가 없어요 (수동 업로드)" : "이미 진행 중" }); onChange(); }
    catch (e) { setMsg({ ok: false, text: earErrMsg(e) }); } finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setMsg(null);
    try {
      if (!st?.episode_id) throw new Error("에피소드 연결이 없어요");
      const text = await readScriptSegments(st.episode_id);
      if (!text) throw new Error("산출물이 없어요 — 먼저 [자막 뽑기]");
      const file = new File([text], "script-segments.json", { type: "application/json" });
      const r = await republishEarContent(c.id, { script: file }); // script_file 단독 — 버전 무변경·재생 위치 보존 (admin-api 4.10)
      if (r.script_applied) setMsg({ ok: true, text: `반영됨 — 콘텐츠 버전 ${r.content_version} 그대로` });
      else setMsg({ ok: false, text: `거부됨: ${r.script_rejected_reason ?? "사유 없음"}` });
      onChange();
    } catch (e) { setMsg({ ok: false, text: earErrMsg(e) }); } finally { setBusy(false); }
  }
  return (
    <div className="leading-tight">
      <div className="flex items-center gap-1.5">
        {c.has_script ? <Badge tone="done">자막</Badge> : <Badge tone="queued">자막 없음</Badge>}
        {running && <span className="text-[10.5px] text-blue-700">{st!.status === "queued" ? "대기" : "정렬 중"}</span>}
        {st?.status === "failed" && <span className="text-[10.5px] text-rose-700" title={st.error ?? ""}>실패</span>}
      </div>
      <div className="mt-1 flex gap-1">
        {!running && <button className={btnCls()} disabled={busy} onClick={() => void extract()} title="발행본 오디오와 대본을 강제 정렬해 턴별 시각을 뽑는다 — 오디오는 그대로 (제품 반영은 [반영])">자막 뽑기</button>}
        {st?.ready && !running && <button className={btnCls("primary")} disabled={busy} onClick={() => void apply()} title="script_file 만 보낸다 — 콘텐츠 버전은 오르지 않고 재생 위치가 보존된다">반영</button>}
      </div>
      {msg && <div className={`mt-1 text-[10.5px] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</div>}
    </div>
  );
}
