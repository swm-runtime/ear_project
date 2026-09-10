"use client";
import { MAJOR_TOPICS } from "@/lib/taxonomy";
import { useState, useTransition } from "react";
import { saveSetting } from "../actions";
import { Panel, btnCls } from "@/components/ui";

const inp = "rounded border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-brand";

export function SettingsForm({ tts, worker, templates, thumbnail, anchor, meta }: { tts: any; worker: any; templates: any; thumbnail: any; anchor: any; meta: any }) {
  const [t, setT] = useState({ voices: { 윤아: "", 이음: "" }, speed: { 윤아: 1, 이음: 1 }, mode: "per-turn", model: "eleven_v3", ...tts });
  const [w, setW] = useState({ default_model: "", ...worker });
  const [tpl, setTpl] = useState({ version: "tpl-v1", intro: "", closing: "", closing_signoff: "", major_lines: {} as Record<string, string>, ...templates });
  // 썸네일 대분류 띠 색(KAN-50 3-2) — 비우면 워커의 thumb-v1 기본값이 쓰인다
  const [th, setTh] = useState<Record<string, string>>({ ...(thumbnail ?? {}) });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const save = (key: string, value: unknown, name: string) =>
    start(async () => { try { await saveSetting(key, value); setMsg(`${name} 저장됨`); } catch (e: any) { setMsg(e.message); } });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="썸네일 — 대분류 띠 색 (KAN-50)" className="text-[13px]">
        <p className="mb-3 text-xs text-ink-soft">
          썸네일 오른쪽 위 삼각형의 색이다. 프롬프트에는 <code>이름 (#HEX)</code> 형태로 그대로 들어간다 —
          이름 없이 HEX 만 주면 모델이 색을 덜 정확히 맞춘다. <b>비우면 워커의 기본값</b>(thumb-v1 표)이 쓰인다.
          44pt 에서 띠는 작은 점 크기라 명도·색상이 모두 달라야 구분된다.
        </p>
        {MAJOR_TOPICS.map((m) => (
          <div key={m} className="mb-2 grid grid-cols-[7rem_1fr_1.75rem] items-center gap-2">
            <span className="text-ink-soft">{m}</span>
            <input className={inp} placeholder="딥 그린 (#2F6B4F)" value={th[m] ?? ""} onChange={(e) => setTh({ ...th, [m]: e.target.value })} />
            <span className="h-5 w-5 rounded border border-line" style={{ background: (th[m] ?? "").match(/#[0-9a-fA-F]{6}/)?.[0] ?? "transparent" }} />
          </div>
        ))}
        <div className="mt-3 flex items-center gap-2">
          <button className={btnCls("primary")} disabled={pending}
            onClick={() => save("thumbnail.colors", Object.fromEntries(Object.entries(th).filter(([, v]) => v.trim())), "띠 색")}>저장</button>
          {meta["thumbnail.colors"]?.updated_by && <span className="text-xs text-ink-soft">마지막 {meta["thumbnail.colors"].updated_by}</span>}
        </div>
        <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">
          <b>스타일 앵커</b>: {anchor?.episode_id
            ? <>현재 <code>{anchor.episode_id}</code> 의 썸네일 (<code>{anchor.key}</code>). 바꾸려면 그 에피소드의 썸네일 탭에서 [이 썸네일을 앵커로 지정].</>
            : <>지정되지 않음 — 에피소드의 썸네일 탭에서 지정하면 이후 생성이 그 화풍을 따라간다.</>}
        </p>
      </Panel>
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
        <p className="text-xs text-ink-soft">프롬프트 버전은 더 이상 여기서 정하지 않는다 — 워커가 <a className="underline" href="/assets">규칙 자산</a>의 active 버전에서 유도해 <code>runs.prompt_version</code>·<code>episodes.asset_versions</code> 에 기록한다 (spec/10 3.2).</p>
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
            <label className="text-xs text-ink-soft">마무리 (진행 담당 도입 → 해설 담당 정리)</label>
            <textarea className={`${inp} mt-1 w-full font-mono text-xs`} rows={4} value={tpl.closing} onChange={(e) => setTpl({ ...tpl, closing: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-ink-soft">클로징 인사 — 정리 뒤 진행 담당이 말하는 마지막 턴 (tpl-v2). 한 줄에 골격 하나, 여러 줄이면 에피소드마다 돌아가며 쓴다. 비우면 정리로 끝난다(tpl-v1). 넣을 때는 버전을 tpl-v2 로</label>
            <textarea className={`${inp} mt-1 w-full font-mono text-xs`} rows={3} value={tpl.closing_signoff ?? ""} onChange={(e) => setTpl({ ...tpl, closing_signoff: e.target.value })} />
          </div>
        </div>
        <label className="mt-3 block text-xs text-ink-soft">대분류별 한 줄 ({"{대주제 한 줄}"}) — 채널 아이덴티티. 비우면 AI가 에피소드마다 새로 짓는다</label>
        {MAJOR_TOPICS.map((mj) => (
          <div key={mj} className="mt-1.5 grid grid-cols-[5rem_1fr] items-center gap-2">
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
