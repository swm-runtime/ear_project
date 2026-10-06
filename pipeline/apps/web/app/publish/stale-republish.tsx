"use client";
import { useState } from "react";
import { EarContent, listEarContents, republishEarContent } from "@/lib/ear";
import { fetchDistAudio, fetchLosslessAudio } from "@/lib/publish-files";
import { enrichStates, markPublished, readEnrichment, republishPlans, type RepublishPlan } from "../actions";
import { isStale } from "./enrich-cell";
import { btnCls } from "@/components/ui";
import { earErrMsg } from "./ear-connect";

/**
 * 구형 전체 재발행 (2026-10-02 박수헌) — 서비스 중인 콘텐츠 전부에서 발행본보다 새로 만든 파트를 한 번에 보낸다.
 * - 오디오: 발행 이후 TTS 를 다시 했으면 교체. **자막을 함께 싣는다** — 없으면 제품이 기존 자막을 지운다(admin-api 4.10 "대본 삭제")
 * - 썸네일: 발행 이후 다시 만들었으면 교체
 * - 자막만: 오디오는 그대로인데 제품에 자막이 없고 TTS·정렬 자막이 있으면 반영(버전 무변경)
 * - 추천 메타: 제품 메타가 구형·없음이고 뽑아 둔 산출물이 있으면 반영(버전 무변경). 뽑기는 하지 않는다 — [전부 다시 뽑기]가 먼저
 * 오디오·썸네일이 바뀌면 content_version 이 올라 앱 재생 위치가 초기화된다. 발행 준비 작업이 도는 편은 건너뛴다(끝난 뒤 다시 누른다).
 * 판정 규칙은 에피소드 화면 [재발행]과 같다(actions.ts republishPlans). 한 편씩 순서대로 보낸다.
 */
type Target = { c: EarContent; p?: RepublishPlan; audio: boolean; thumbnail: boolean; scriptOnly: boolean; meta: boolean };

export function StaleRepublishButton({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true); setMsg("구형 판정 중…");
    try {
      const all: EarContent[] = [];
      for (let off = 0; ; off += 50) { const d = await listEarContents("published", off, 50); all.push(...d.items); if (off + 50 >= d.total || d.items.length === 0) break; }
      const ids = all.map((c) => c.id);
      const [plans, enrich] = await Promise.all([republishPlans(ids), enrichStates(ids)]);
      const skipped = all.filter((c) => plans[c.id]?.busy);
      const targets: Target[] = all.filter((c) => !plans[c.id]?.busy).map((c) => {
        const p = plans[c.id];
        return { c, p, audio: !!p?.audio, thumbnail: !!p?.thumbnail, scriptOnly: !!p && !p.audio && !c.has_script, meta: isStale(c) && !!enrich[c.id]?.ready };
      }).filter((t) => t.audio || t.thumbnail || t.scriptOnly || t.meta);
      if (!targets.length) { setMsg(`최신화할 구형이 없어요${skipped.length ? ` (발행 준비 진행 중 ${skipped.length}편은 끝난 뒤 다시)` : ""}`); return; }
      const n = (f: (t: Target) => boolean) => targets.filter(f).length;
      const lines = [
        `서비스 중인 콘텐츠 ${targets.length}편을 최신화할까요?`,
        "",
        `· 오디오(+자막) ${n((t) => t.audio)}편 · 썸네일 ${n((t) => t.thumbnail)}편 — 콘텐츠 버전이 올라 앱 재생 위치가 초기화돼요`,
        `· 자막만 ${n((t) => t.scriptOnly)}편 · 추천 메타 ${n((t) => t.meta)}편 — 버전 그대로`,
      ];
      if (skipped.length) lines.push(`· 발행 준비 진행 중이라 이번에 빼는 편 ${skipped.length}편 — 끝난 뒤 다시 누르세요`);
      lines.push("", "오디오를 바꾸는 편은 청취 확인을 마쳤나요?");
      if (!confirm(lines.join("\n"))) { setMsg(null); return; }

      const done: string[] = [], bad: string[] = [];
      let noScript = 0;
      for (const [i, t] of targets.entries()) {
        setMsg(`재발행 중 ${i + 1}/${targets.length} — ${t.c.title.slice(0, 20)}`);
        try {
          const r = await refreshOne(t);
          if (r.noScript) noScript++;
          if (r.sent.length) done.push(`${t.c.title.slice(0, 18)}: ${r.sent.join("·")}`);
        } catch (e) { bad.push(`${t.c.title.slice(0, 18)}: ${earErrMsg(e)}`); }
      }
      const text = `최신화 ${done.length}편${noScript ? ` · 자막을 못 실은 오디오 ${noScript}편(앱 자막 없음)` : ""}${bad.length ? ` · 실패 ${bad.length}편` : ""}${skipped.length ? ` · 진행 중이라 뺀 ${skipped.length}편` : ""}`;
      setMsg(text);
      alert(`${text}${bad.length ? `\n\n실패\n${bad.join("\n")}` : ""}`);
    } catch (e) { setMsg(earErrMsg(e)); }
    finally { setBusy(false); onDone(); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button className={btnCls()} disabled={disabled || busy} onClick={() => void run()}
        title="서비스 중인 콘텐츠 전부에서 발행 이후 다시 만든 오디오(+자막)·썸네일, 빠진 자막, 뽑아 둔 최신 추천 메타를 한 번에 보낸다 — 발행 준비가 도는 편은 건너뜀">
        {busy ? "재발행 중…" : "구형 전체 재발행"}
      </button>
      {msg && <span className="text-[11px] text-ink-soft">{msg}</span>}
    </span>
  );
}

/** 한 편 최신화 — 바뀐 파트만 한 요청에 싣는다. 오디오·썸네일이 있으면 발행 기록(republish)을 남긴다 */
async function refreshOne(t: Target): Promise<{ sent: string[]; noScript: boolean }> {
  const ep = t.p?.episodeId;
  const fetchFile = async (query: string, name: string, type: string, optional = false) => {
    const res = await fetch(`/api/publish/${ep}?${query}=1`);
    if (!res.ok) { if (optional) return undefined; throw new Error(`${name} 을(를) 읽지 못함 — 에피소드 파일 확인`); }
    return new File([await res.blob()], name, { type });
  };
  const audio = t.audio && ep ? (await fetchDistAudio(ep)) ?? undefined : undefined;
  if (t.audio && !audio) throw new Error(`${ep} 발행 오디오(dist.m4a·dist.mp3)를 읽지 못함 — 에피소드 파일 확인`);
  const lossless = audio && ep ? (await fetchLosslessAudio(ep)) ?? undefined : undefined; // 무손실(Pro) — 서버 스위치가 꺼져 있으면 없음
  const thumbnail = t.thumbnail ? await fetchFile("thumbnail", `${ep}.png`, "image/png") : undefined;
  const script = ep && (t.audio || t.scriptOnly) ? await fetchFile("script", "script-segments.json", "application/json", true) : undefined;
  let enrichment: File | undefined;
  if (t.meta) { const got = await readEnrichment(t.c.id); if (got) enrichment = new File([got.text], "enrichment.json", { type: "application/json" }); }
  if (!audio && !thumbnail && !script && !enrichment) return { sent: [], noScript: false };
  const r = await republishEarContent(t.c.id, { audio, lossless, thumbnail, script, enrichment });
  const sent = [audio && "오디오", thumbnail && "썸네일", r.script_applied && "자막", r.enrichment_applied && "메타"].filter(Boolean) as string[];
  if ((audio || thumbnail) && t.p) {
    await markPublished(t.p.backlogId, r.id, r.content_version, undefined, {
      action: "republish",
      parts: [audio && "audio", thumbnail && "thumbnail", r.script_applied && "script", r.enrichment_applied && "enrichment"].filter(Boolean) as string[],
      episodeId: ep,
      note: `구형 전체 재발행 — ${sent.join("·")}${audio && !r.script_applied ? " · ⚠️ 자막 없음" : ""}`,
    });
  }
  return { sent, noScript: !!audio && !r.script_applied };
}

/** 행 표시 — 발행본보다 새로 만든 파트(구형)나 발행 준비 진행 중 */
export function StaleNote({ c, p }: { c: EarContent; p?: RepublishPlan }) {
  if (!p) return null;
  if (p.busy) return <div className="text-[10.5px] text-blue-700">발행 준비 진행 중</div>;
  const parts = [p.audio && "오디오", p.thumbnail && "썸네일", !p.audio && !c.has_script && "자막 없음"].filter(Boolean);
  return parts.length ? <div className="text-[10.5px] text-amber-700" title="발행 이후 다시 만들어진 파트 — [구형 전체 재발행]으로 보낸다">구형: {parts.join("·")}</div> : null;
}
