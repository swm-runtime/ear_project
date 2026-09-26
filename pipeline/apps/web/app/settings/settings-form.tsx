"use client";
import { MAJOR_TOPICS } from "@/lib/taxonomy";
import { useState, useTransition } from "react";
import { saveSetting } from "../actions";
import { Panel, btnCls } from "@/components/ui";

const inp = "rounded border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-brand";

export function SettingsForm({ tts, worker, templates, thumbnail, anchor, automation, aiPaused, meta }: { tts: any; worker: any; templates: any; thumbnail: any; anchor: any; automation: { auto_approve?: boolean; auto_publish_prep?: boolean; rule?: string; server_ai_claim?: boolean } | null; aiPaused: { paused?: boolean; reason?: string; at?: string; job?: string } | null; meta: any }) {
  const [t, setT] = useState({ voices: { 윤아: "", 이음: "" }, speed: { 윤아: 1, 이음: 1 }, mode: "per-turn", model: "eleven_v3", ...tts });
  const [w, setW] = useState({ default_model: "", ...worker });
  const [tpl, setTpl] = useState({ version: "tpl-v1", intro: "", closing: "", closing_signoff: "", major_lines: {} as Record<string, string>, ...templates });
  // 썸네일 대분류 띠 색(KAN-50 3-2) — 비우면 워커의 thumb-v1 기본값이 쓰인다
  const [th, setTh] = useState<Record<string, string>>({ ...(thumbnail ?? {}) });
  // 자동화 스위치 (0023, 2026-09-23) — 워커가 30초 안에 반영한다. 행이 없으면(마이그레이션 전) 전부 off 로 보인다
  const [auto, setAuto] = useState({ auto_approve: false, auto_publish_prep: false, rule: "v1", server_ai_claim: true, ...(automation ?? {}) });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const save = (key: string, value: unknown, name: string) =>
    start(async () => { try { await saveSetting(key, value); setMsg(`${name} 저장됨`); } catch (e: any) { setMsg(e.message); } });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="자동화 (spec/03 6.1 · spec/07 1장, 2026-09-23)" className="text-[13px] md:col-span-2">
        <p className="mb-3 text-xs text-ink-soft">
          군집화까지는 사람+Claude, 그 뒤는 워커가 잇는다. 끄면 그 지점부터 종전대로 사람이 누른다 — 진행 중인 작업은 끝까지 간다.
          하루 상한은 두지 않는다(API 쪽 hard limit 이 상한). 알림은 편마다가 아니라 큐가 다 비었을 때 한 번 — 검수 대기·검토 필요·초안 실패·연쇄 실패를 Slack 요약으로 보낸다.
        </p>
        <label className="mb-2 flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={!!auto.auto_approve} onChange={(e) => setAuto({ ...auto, auto_approve: e.target.checked })} />
          <span><b>후보 자동 승인</b> (규칙 {auto.rule}) — 군집화 v2 · 빈 역할 없음 · 소스 겹침 경고 없음이면 <code>approved_by = auto:{auto.rule}</code> 로 승인하고 초안을 건다. 조건 밖 후보와 초안 실패로 돌아온 후보는 사람이 본다.</span>
        </label>
        <label className="mb-2 flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={!!auto.auto_publish_prep} onChange={(e) => setAuto({ ...auto, auto_publish_prep: e.target.checked })} />
          <span><b>비평 뒤 발행 준비 자동</b> — 비평이 끝나면 TTS → 썸네일 → 패키지를 바로 잇는다(ElevenLabs·OpenAI 과금). 추천 메타·검수·발행은 업로드 화면에서 사람이 한다.</span>
        </label>
        <label className="mb-2 flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={auto.server_ai_claim !== false} onChange={(e) => setAuto({ ...auto, server_ai_claim: e.target.checked })} />
          <span><b>서버 워커가 AI 작업을 집는다</b> — 끄면 서버(GPT)는 스윕·TTS·패키지 같은 io 작업만 하고, 군집화·초안·QA·비평은 노트북 Claude 워커만 집는다. 큐에 있는 AI 작업은 사라지지 않고 기다린다. 군집화를 Claude 로 돌릴 때 끈다.</span>
        </label>
        <div className="mt-3 flex items-center gap-2">
          <button className={btnCls("primary")} disabled={pending} onClick={() => save("automation", auto, "자동화 설정")}>저장</button>
          {meta.automation?.updated_by && <span className="text-xs text-ink-soft">마지막 {meta.automation.updated_by}</span>}
        </div>
        {/* API 한도 차단기 (ai-pause.ts): 잔액·예산 소진이면 워커가 여기에 멈춤을 기록하고 AI 작업을 집지 않는다. 분당 한도는 5분 뒤 자동 재개라 여기 안 보인다 */}
        <div className={`mt-3 rounded border px-3 py-2 text-xs ${aiPaused?.paused ? "border-red-300 bg-red-50 text-red-800" : "border-line text-ink-soft"}`}>
          {aiPaused?.paused
            ? <>
                <b>AI 작업 멈춤 — OpenAI 잔액·예산 소진.</b> 워커가 {aiPaused.job ?? "작업"} 실행 중 429(quota)를 받고 그 작업을 큐로 되돌렸어요{aiPaused.at ? ` (${new Date(aiPaused.at).toLocaleString("ko-KR")})` : ""}. 큐는 그대로이고 TTS 같은 io 작업만 돕니다.
                <div className="mt-1 font-mono text-[11px] text-red-700">{aiPaused.reason}</div>
                <button className={`${btnCls("primary")} mt-2`} disabled={pending}
                  onClick={() => { if (confirm("OpenAI 충전·예산 조정을 마쳤나요? 재개하면 워커가 30초 안에 큐의 AI 작업을 다시 집습니다.")) save("automation.ai_paused", { paused: false, resumed_at: new Date().toISOString() }, "AI 작업 재개"); }}>
                  AI 작업 재개
                </button>
              </>
            : <>API 한도 차단기: 분당 한도(429 rate)는 5분 멈췄다 자동 재개, 잔액·예산 소진(429 quota)은 여기 멈춤으로 표시되고 재개 버튼이 나타나요. 되돌린 작업은 실패 처리되지 않고 큐에 남습니다.</>}
        </div>
      </Panel>
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
        <p className="mb-3 text-xs text-ink-soft">보이스 ID는 채널 아이덴티티 — 확정 후 고정한다 (미결 #8). 변환은 에피소드 화면의 [발행 준비] 또는 자동화(비평 뒤 자동)가 건다.</p>
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
