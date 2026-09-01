"use client";
import { useState, useTransition } from "react";
import { saveSetting } from "../actions";
import { Panel, btnCls } from "@/components/ui";

const inp = "rounded border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-brand";

export function SettingsForm({ tts, worker, templates, meta }: { tts: any; worker: any; templates: any; meta: any }) {
  const [t, setT] = useState({ voices: { 윤아: "", 이음: "" }, speed: { 윤아: 1, 이음: 1 }, mode: "per-turn", model: "eleven_v3", ...tts });
  const [w, setW] = useState({ default_model: "", prompt_version: "full-v5.1", ...worker });
  const [tpl, setTpl] = useState({ version: "tpl-v1", intro: "", closing: "", major_lines: {} as Record<string, string>, ...templates });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const save = (key: string, value: unknown, name: string) =>
    start(async () => { try { await saveSetting(key, value); setMsg(`${name} 저장됨`); } catch (e: any) { setMsg(e.message); } });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="TTS (ElevenLabs, spec/06)" className="text-[13px]">
        <p className="mb-3 text-xs text-ink-soft">보이스 ID는 채널 아이덴티티 — 확정 후 고정한다 (미결 #8). 변환은 에피소드 화면에서 사람이 요청할 때만 실행된다.</p>
        {(["윤아", "이음"] as const).map((sp) => (
          <div key={sp} className="mb-2 grid grid-cols-[3rem_1fr_5rem] items-center gap-2">
            <span className={sp === "윤아" ? "text-rose-700" : "text-sky-700"}>{sp}</span>
            <input className={inp} placeholder="voice_id" value={t.voices?.[sp] ?? ""} onChange={(e) => setT({ ...t, voices: { ...t.voices, [sp]: e.target.value } })} />
            <input className={inp} type="number" step="0.05" min="0.7" max="1.2" value={t.speed?.[sp] ?? 1} onChange={(e) => setT({ ...t, speed: { ...t.speed, [sp]: Number(e.target.value) } })} />
          </div>
        ))}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <label className="text-ink-soft">합성 방식</label>
          <select className={inp} value={t.mode} onChange={(e) => setT({ ...t, mode: e.target.value })}>
            <option value="per-turn">턴별 합성 + 이어붙이기</option>
            <option value="dialogue">다중화자 1콜</option>
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className={btnCls("primary")} disabled={pending} onClick={() => save("tts", t, "TTS 설정")}>저장</button>
          {meta.tts?.updated_by && <span className="text-xs text-ink-soft">마지막 {meta.tts.updated_by}</span>}
        </div>
      </Panel>

      <Panel title="워커" className="text-[13px]">
        <p className="mb-3 text-xs text-ink-soft">참고값 — 워커는 자기 .env 를 우선한다 (CLAUDE_MODEL 미설정 시 계정 기본 모델).</p>
        <label className="text-xs text-ink-soft">기본 모델</label>
        <input className={`${inp} mb-3 mt-1 w-full`} placeholder="(비우면 계정 기본) 예: claude-opus-5" value={w.default_model} onChange={(e) => setW({ ...w, default_model: e.target.value })} />
        <label className="text-xs text-ink-soft">프롬프트 버전</label>
        <input className={`${inp} mt-1 w-full`} value={w.prompt_version} onChange={(e) => setW({ ...w, prompt_version: e.target.value })} />
        <div className="mt-3 flex items-center gap-2">
          <button className={btnCls("primary")} disabled={pending} onClick={() => save("worker", w, "워커 설정")}>저장</button>
          {meta.worker?.updated_by && <span className="text-xs text-ink-soft">마지막 {meta.worker.updated_by}</span>}
        </div>
      </Panel>

      <Panel title={`시그니처 템플릿 (${tpl.version}) — spec/04 5장`} className="text-[13px] md:col-span-2">
        <p className="mb-3 text-xs text-ink-soft">골격은 고정, {"{슬롯}"}만 에피소드별로 채워진다. 대본 생성 시 워커가 이 문구를 주입한다.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-ink-soft">인트로</label>
            <textarea className={`${inp} mt-1 w-full font-mono text-xs`} rows={4} value={tpl.intro} onChange={(e) => setTpl({ ...tpl, intro: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-ink-soft">마무리</label>
            <textarea className={`${inp} mt-1 w-full font-mono text-xs`} rows={4} value={tpl.closing} onChange={(e) => setTpl({ ...tpl, closing: e.target.value })} />
          </div>
        </div>
        <label className="mt-3 block text-xs text-ink-soft">대분류별 한 줄 ({"{대주제 한 줄}"}) — 채널 아이덴티티. 비우면 AI가 에피소드마다 새로 짓는다</label>
        {["돈", "배움", "일"].map((mj) => (
          <div key={mj} className="mt-1.5 grid grid-cols-[3rem_1fr] items-center gap-2">
            <span className="text-xs">{mj}</span>
            <input className={inp} placeholder="(미확정 — AI 생성)" value={tpl.major_lines?.[mj] ?? ""} onChange={(e) => setTpl({ ...tpl, major_lines: { ...tpl.major_lines, [mj]: e.target.value } })} />
          </div>
        ))}
        <div className="mt-3 flex items-center gap-2">
          <button className={btnCls("primary")} disabled={pending} onClick={() => save("templates", tpl, "템플릿")}>저장</button>
          {meta.templates?.updated_by && <span className="text-xs text-ink-soft">마지막 {meta.templates.updated_by}</span>}
        </div>
      </Panel>

      {msg && <p className="text-xs text-ink-soft md:col-span-2">{msg}</p>}
    </div>
  );
}
