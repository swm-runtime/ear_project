"use client";
import { useState, useTransition } from "react";
import { decideDomain, requestDomainCheck } from "@/app/actions";
import { btnCls } from "@/components/ui";

const TIERS: [string, string, string][] = [
  ["allow_open", "1군 — 자동 허용", "라이선스 명시 허용(공공누리·CC·오픈액세스) 또는 공공·기업 공식 발행물. 대본 뼈대 소스로 쓸 수 있다"],
  ["allow_support", "2군 — 보조 근거만", "상업 매체·개인 블로그 중 약관이 AI 재사용을 금지하지 않는 곳. 뼈대 금지, 사실 교차 확인만"],
  ["hold", "보류", "판정이 애매한 곳 — 사용 금지 (2군으로 내리지 말 것)"],
  ["blocked", "차단", "페이월·로그인 뒤, 약관의 AI 재사용 금지, 기술적 차단(403) 우회 필요 — 예외 없이 배제"],
  ["candidate", "후보 (미판정)", "아직 사람이 판정하지 않음 — 사용 금지"],
];
const CHECK: [string, string, string][] = [
  ["license", "① 라이선스 표기", "푸터·소개 페이지의 공공누리 마크·CC 표기·오픈액세스 정책"],
  ["publisher", "② 발행 주체 성격", "공공기관·기업 공식 채널인가, 상업 매체·개인인가"],
  ["terms", "③ 약관 금지 조항", "AI 학습·재사용·자동수집 금지 문구가 있는가"],
  ["access", "④ 접근 구조", "페이월·로그인 뒤인가, robots.txt 가 수집을 거부하는가"],
];
type Item = { status: "ok" | "warn" | "bad" | "unknown"; summary: string; snippets?: { url: string; text: string }[] };
type Evidence = { checked_at?: string; items?: Record<string, Item>; suggestion?: string | null; suggestion_reason?: string; prior_suggestion?: string | null; http?: Record<string, number | string> } | null;
const STATUS: Record<Item["status"], [string, string]> = {
  ok: ["bg-emerald-500", "확인됨"], warn: ["bg-amber-500", "주의"], bad: ["bg-rose-500", "문제"], unknown: ["bg-gray-300", "미확인"],
};
const TIER_NAME: Record<string, string> = { allow_open: "1군", allow_support: "2군", hold: "보류", blocked: "차단" };

/** 목록 행용 — ①②③④ 상태 점 4개 + 기계 제안 */
export function EvidenceDots({ ev }: { ev: Evidence }) {
  if (!ev?.items) return <div className="mt-0.5 text-[10px] text-ink-soft">확인 전</div>;
  return (
    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-soft">
      {CHECK.map(([k, name]) => { const it = ev.items?.[k]; const [cls, label] = STATUS[it?.status ?? "unknown"]; return <span key={k} title={`${name}: ${label} — ${it?.summary ?? ""}`} className={`inline-block h-2 w-2 rounded-full ${cls}`} />; })}
      {ev.suggestion && <span className="ml-1">제안 {TIER_NAME[ev.suggestion] ?? ev.suggestion}</span>}
    </div>
  );
}

function EvidenceList({ d }: { d: any }) {
  const ev: Evidence = d.evidence ?? null;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">확인 항목</p>
        <span className="text-[11px] text-ink-soft">{ev?.checked_at ? `자동 확인 ${new Date(ev.checked_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "자동 확인 전"}</span>
        <button className="ml-auto rounded border border-line px-2 py-0.5 text-[11px] hover:bg-[#f7f9fb]" disabled={pending}
          onClick={(e) => { e.stopPropagation(); start(async () => { try { await requestDomainCheck([d.id], false); setMsg("확인 작업 큐에 넣음 — 워커가 돌면 1분 안에 갱신"); } catch (err: any) { setMsg(err.message); } }); }}>
          {ev ? "다시 확인" : "지금 확인"}
        </button>
      </div>
      {msg && <p className="mb-1 text-[11px] text-brand">{msg}</p>}
      <ul className="space-y-1.5 text-xs">
        {CHECK.map(([k, name, desc]) => {
          const it = ev?.items?.[k]; const [cls, label] = STATUS[it?.status ?? "unknown"];
          return (
            <li key={k} className="rounded border border-line bg-panel px-2.5 py-2">
              <div className="flex items-start gap-2">
                <span className={`mt-1 inline-block h-2.5 w-2.5 flex-none rounded-full ${cls}`} />
                <div className="min-w-0 flex-1">
                  <div><b className="font-semibold">{name}</b> <span className="text-ink-soft">— {desc}</span></div>
                  <div className="mt-0.5"><span className="font-medium">{label}</span>{it?.summary ? ` · ${it.summary}` : ""}</div>
                  {(it?.snippets ?? []).slice(0, 2).map((s, i) => (
                    <div key={i} className="mt-1 truncate rounded bg-[#f7f9fb] px-2 py-1 text-[11px] text-ink-soft" title={s.text}>
                      “{s.text}” <a className="underline" href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>출처</a>
                    </div>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {ev?.suggestion && (
        <p className="mt-2 rounded border border-dashed border-line px-2.5 py-1.5 text-[11px] text-ink-soft">
          기계 제안 <b className="text-ink">{TIER_NAME[ev.suggestion] ?? ev.suggestion}</b>{ev.prior_suggestion && ev.prior_suggestion !== ev.suggestion && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">기존 단서 {TIER_NAME[ev.prior_suggestion] ?? ev.prior_suggestion}와 불일치</span>} — {ev.suggestion_reason} <span className="opacity-70">(참고만 — 판정은 사람이 한다)</span>
        </p>
      )}
    </div>
  );
}

export function DecideForm({ d, compact, onDone }: { d: any; compact?: boolean; onDone?: () => void }) {
  const [tier, setTier] = useState<string>(d.tier);
  const [basis, setBasis] = useState<string>(d.license_basis ?? "");
  const [coverage, setCoverage] = useState<string>((d.topic_coverage ?? []).join(", "));
  const [feed, setFeed] = useState<string>(d.feed_url ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const host = String(d.domain).split("/")[0];
  const inp = "w-full rounded border border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand";

  return (
    <div className={compact ? "" : "rounded-md border border-line bg-panel p-4"}>
      {!compact && <h2 className="mb-2 text-[13px] font-semibold">계층 판정 (spec/01 4.1)</h2>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <EvidenceList d={d} />
          <p className="mt-2 text-xs">
            확인 링크:{" "}
            <a className="underline" href={`https://${host}/robots.txt`} target="_blank" rel="noreferrer">robots.txt</a> ·{" "}
            <a className="underline" href={`https://${d.domain}`} target="_blank" rel="noreferrer">사이트</a>
            {d.feed_url && <> · <a className="underline" href={d.feed_url} target="_blank" rel="noreferrer">피드</a></>}
          </p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">판정 보조 증거</p>
          <div className="mt-1 whitespace-pre-wrap rounded bg-[#f7f9fb] p-2.5 text-xs leading-relaxed text-ink-soft">
            {(d.note ?? "-").split(" | ").map((x: string, i: number) => <div key={i}>• {x}</div>)}
          </div>
        </div>
        <div>
          <div className="space-y-1.5">
            {TIERS.map(([v, name, desc]) => (
              <label key={v} className={`flex cursor-pointer items-start gap-2 rounded border px-2.5 py-2 text-xs transition ${tier === v ? "border-brand bg-[#f2fbf9]" : "border-line hover:bg-[#f7f9fb]"}`}>
                <input type="radio" name={`tier-${d.id}`} value={v} checked={tier === v} onChange={() => setTier(v)} className="mt-0.5 accent-[color:var(--brand)]" />
                <span><b className="font-semibold">{name}</b><span className="block text-[11px] text-ink-soft">{desc}</span></span>
              </label>
            ))}
          </div>
          <label className="mt-2 block text-[11px] text-ink-soft">판정 근거 (license_basis) — 확인한 내용을 구체로</label>
          <textarea className={`${inp} mt-1`} rows={2} placeholder='예: "기업 공식 기술블로그. 약관 확인 2026-08-31, 자동수집·AI 재사용 금지 조항 없음" / "CC BY 4.0" / "공공누리 1유형"' value={basis} onChange={(e) => setBasis(e.target.value)} />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input className={inp} placeholder="중분류 커버리지 (쉼표)" value={coverage} onChange={(e) => setCoverage(e.target.value)} />
            <input className={inp} placeholder="RSS/Atom URL" value={feed} onChange={(e) => setFeed(e.target.value)} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button className={btnCls("primary")} disabled={pending || (tier !== "candidate" && !basis.trim())}
              onClick={() => start(async () => {
                try { await decideDomain(d.id, { tier, license_basis: basis, topic_coverage: coverage.split(",").map((s) => s.trim()).filter(Boolean), feed_url: feed || null }); setMsg("저장됨 — 판정자·시각 자동 기록"); onDone?.(); }
                catch (e: any) { setMsg(e.message); }
              })}>판정 저장</button>
            <span className="text-[11px] text-ink-soft">{msg ?? "후보 외 계층은 판정 근거가 필수입니다 (적법 수집 증적)"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
