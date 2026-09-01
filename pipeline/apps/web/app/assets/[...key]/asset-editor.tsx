"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateAsset, saveAssetDraft } from "@/app/actions";
import { bumpVersion, diffLines } from "@/lib/assets";
import { Badge, Panel, btnCls } from "@/components/ui";

type Meta = { version: string; status: "draft" | "active" | "retired"; note: string | null; created_by: string | null; created_at: string; activated_at: string | null; activated_by: string | null };
const ts = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "-");
const tone = (s: Meta["status"]) => s; // TONE 맵의 active·draft·retired 키 (components/ui.tsx)

/**
 * 자산 편집기 (spec/10 3.2 · 5장) — 보기 / 편집 → 새 버전(draft) 저장 / active 대비 diff / 활성화 / 이력.
 * 규약은 DB 트리거가 강제한다(active 본문 불변, 활성화 시 note 필수, 기존 active 자동 retired) — 화면은 그 위의 편의다.
 */
export function AssetEditor({ assetKey, selected, active, history, promote }: {
  assetKey: string;
  selected: { version: string; status: Meta["status"]; content: string; note: string | null };
  active: { version: string; content: string } | null;
  history: Meta[];
  promote: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "diff">(promote ? "edit" : "view");
  const [content, setContent] = useState(selected.content);
  const [version, setVersion] = useState(bumpVersion(active?.version ?? selected.version));
  const [note, setNote] = useState(promote ? "규칙 승격 — 비평 플래그(반복 동의): " : "");
  const [actNote, setActNote] = useState(selected.note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = content !== selected.content;
  const diff = useMemo(() => (active && mode === "diff" ? diffLines(active.content, content) : []), [active, content, mode]);
  const changed = diff.filter((d) => d.type !== "same").length;

  const save = () => start(async () => {
    try { await saveAssetDraft(assetKey, version, content, note); setMsg(`draft ${version} 저장됨`); router.push(`/assets/${assetKey}?v=${encodeURIComponent(version)}`); router.refresh(); }
    catch (e: any) { setMsg(e.message); }
  });
  const activate = () => start(async () => {
    if (!confirm(`${selected.version} 을(를) 활성화합니다. 다음 작업부터 모든 워커가 이 버전을 읽습니다. 계속할까요?`)) return;
    try { await activateAsset(assetKey, selected.version, actNote); setMsg(`${selected.version} 활성화됨`); router.push(`/assets/${assetKey}`); router.refresh(); }
    catch (e: any) { setMsg(e.message); }
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-3">
        <Panel
          title={<span className="flex items-center gap-2">{selected.version} <Badge tone={tone(selected.status)}>{selected.status}</Badge>{active && selected.version !== active.version && <span className="text-xs font-normal text-ink-soft">active: {active.version}</span>}</span> as any}
          right={
            <div className="flex items-center gap-1.5">
              <button className={btnCls(mode === "view" ? "primary" : "ghost")} onClick={() => setMode("view")}>보기</button>
              <button className={btnCls(mode === "edit" ? "primary" : "ghost")} onClick={() => setMode("edit")}>편집</button>
              <button className={btnCls(mode === "diff" ? "primary" : "ghost")} onClick={() => setMode("diff")} disabled={!active}>active 대비 diff{mode === "diff" && changed ? ` (${changed})` : ""}</button>
            </div>
          }
          flush>
          {mode === "diff" ? (
            <pre className="max-h-[70vh] overflow-auto p-3 font-mono text-[12px] leading-relaxed">
              {diff.map((d, i) => (
                <div key={i} className={d.type === "add" ? "bg-emerald-50 text-emerald-800" : d.type === "del" ? "bg-rose-50 text-rose-800 line-through decoration-rose-300" : "text-ink"}>
                  <span className="mr-2 inline-block w-3 select-none text-ink-soft">{d.type === "add" ? "+" : d.type === "del" ? "−" : " "}</span>{d.text || " "}
                </div>
              ))}
              {!changed && <div className="p-2 text-ink-soft">active 와 같다</div>}
            </pre>
          ) : (
            <textarea
              className="block h-[70vh] w-full resize-y border-0 p-3 font-mono text-[12.5px] leading-relaxed outline-none disabled:bg-transparent"
              value={content}
              readOnly={mode !== "edit"}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
          )}
        </Panel>

        {(mode === "edit" || dirty) && (
          <Panel title="새 버전으로 저장 (draft)" className="text-[13px]">
            <p className="mb-2 text-xs text-ink-soft">{selected.status === "active" ? "active 본문은 직접 고칠 수 없다 — 수정본은 새 버전(draft)이 되고, 활성화 전까지 워커에 영향이 없다." : "draft 를 고쳐도 새 버전으로 저장된다(버전 = 그때 실제 내용)."}</p>
            <div className="grid gap-2 md:grid-cols-[14rem_1fr_auto]">
              <input className="rounded border border-line px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-brand" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="버전 라벨 (full-v5.2)" />
              <input className="rounded border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" value={note} onChange={(e) => setNote(e.target.value)} placeholder="무엇을 왜 바꿨나 (활성화 때 CHANGELOG 로)" />
              <button className={btnCls("primary")} disabled={pending || !dirty || !version.trim()} onClick={save}>draft 저장</button>
            </div>
          </Panel>
        )}

        {selected.status === "draft" && (
          <Panel title="활성화" className="text-[13px]">
            <p className="mb-2 text-xs text-ink-soft">활성화하면 기존 active 는 retired 가 되고, <b>다음에 시작하는 작업부터</b> 모든 워커가 이 버전을 읽는다. 진행 중인 에피소드는 시작 때 버전을 유지한다. 연동 갱신(spec/09 4.3): guidelines 를 바꿨으면 루브릭·골드·QA 프롬프트도 같이 봤는가?</p>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <input className="rounded border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" value={actNote} onChange={(e) => setActNote(e.target.value)} placeholder="변경 사유 (필수 — CHANGELOG 한 줄)" />
              <button className={btnCls("danger")} disabled={pending || !actNote.trim()} onClick={activate}>활성화</button>
            </div>
          </Panel>
        )}
        {msg && <p className="text-[13px] text-ink-soft">{msg}</p>}
      </div>

      <Panel title="버전 이력" className="text-[13px]" flush>
        <ul className="divide-y divide-line">
          {history.map((h) => (
            <li key={h.version} className={`px-3 py-2 ${h.version === selected.version ? "bg-[#f7f9fb]" : ""}`}>
              <a href={`/assets/${assetKey}?v=${encodeURIComponent(h.version)}`} className="flex items-center gap-2">
                <span className="font-mono text-[12px]">{h.version}</span><Badge tone={tone(h.status)}>{h.status}</Badge>
              </a>
              <div className="mt-0.5 text-[11px] text-ink-soft">{h.status === "active" || h.status === "retired" ? `활성화 ${ts(h.activated_at)} · ${h.activated_by ?? "-"}` : `작성 ${ts(h.created_at)} · ${h.created_by ?? "-"}`}</div>
              {h.note && <div className="mt-0.5 text-[11px] text-ink">{h.note}</div>}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
