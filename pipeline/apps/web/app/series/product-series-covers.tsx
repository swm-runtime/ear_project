"use client";
import { useCallback, useEffect, useState } from "react";
import { publicationByName, publicationOf, publicationsFor, type PipelineLocale } from "@ear/pipeline";
import { EarSeries, listEarSeries, patchEarSeries, putEarSeriesCover } from "@/lib/ear";
import { EarGate, earErrMsg } from "@/app/publish/ear-connect";
import { btnCls, Panel, Table, Td } from "@/components/ui";

/**
 * 제품 시리즈 표지·간행물 (2026-10-22 KAN-234·KAN-136 · 2026-10-26 KAN-247) — 운영 서버의 시리즈 목록(`GET /admin/series`)을 보여 주고,
 * 표지는 파일을 골라 `PUT /admin/series/:id/cover` 로, 간행물(발행 이름)은 `PATCH /admin/series/:id` `publisher_name` 으로 바꾼다.
 * 파이프라인 밖에서 묶인 시리즈(CS 16편 · 경제 상식 · 철학 — BE 일회성 마이그레이션)는 [시리즈 발행]을 거치지 않아 표지·간행물을 손볼 곳이 여기뿐이다.
 * 표지가 없으면 앱은 가장 앞 편 썸네일을 쓴다 — 편 썸네일에 번호("01")가 찍히는 디자인이면 표지를 따로 올려야 한다(spec/11 7장).
 */
export function ProductSeriesCovers({ locale }: { locale: PipelineLocale }) {
  return (
    <Panel title="제품 시리즈 — 간행물 · 표지 (운영)" right={<span className="text-[11px] text-ink-soft">간행물 = 앱 시리즈 화면 제목 아래 발행 이름 · 표지가 없으면 앱은 가장 앞 편 썸네일을 쓴다</span>}>
      <EarGate><CoverTable locale={locale} /></EarGate>
    </Panel>
  );
}

function CoverTable({ locale }: { locale: PipelineLocale }) {
  const [items, setItems] = useState<EarSeries[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setItems((await listEarSeries()).items); setErr(null); } catch (e) { setErr(earErrMsg(e)); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]); // 동기 setState 회피 (react-hooks/set-state-in-effect)
  if (err) return <p className="text-[12.5px] text-rose-700">{err}</p>;
  if (!items) return <p className="text-[12.5px] text-ink-soft">시리즈 목록 읽는 중…</p>;
  return (
    <Table head={["시리즈", "편수", "상태", "간행물", "표지", ""]} empty="제품에 시리즈가 없다">
      {items.map((s) => <CoverRow key={s.id} s={s} locale={locale} onChange={(next) => setItems((cur) => (cur ?? []).map((x) => (x.id === next.id ? next : x)))} />)}
    </Table>
  );
}

function CoverRow({ s, locale, onChange }: { s: EarSeries; locale: PipelineLocale; onChange: (s: EarSeries) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const c = s.episode_counts;
  const options = publicationsFor(locale);
  const current = publicationByName(s.publisher_name, locale);
  const unknown = !!s.publisher_name?.trim() && !current; // 목록에 없는 발행 이름(다른 판·옛 값) — 그대로 보여 주고, 바꾸면 목록 값으로만
  async function upload() {
    if (!file) return;
    if (!confirm(`"${s.title}" 의 표지를 ${file.name} (${(file.size / 1024).toFixed(0)}KB) 로 바꿀까요?\n탐색 시리즈 카드와 시리즈 화면에 바로 반영됩니다. 편 썸네일은 그대로입니다.`)) return;
    setBusy(true); setMsg(null);
    try {
      const next = await putEarSeriesCover(s.id, file);
      onChange(next); setFile(null);
      setMsg({ text: "표지 올림", bad: false });
    } catch (e) { setMsg({ text: earErrMsg(e), bad: true }); }
    finally { setBusy(false); }
  }
  async function setPublication(key: string) {
    const pub = publicationOf(key || null);
    const name = pub?.name ?? null;
    if ((s.publisher_name ?? null) === name) return;
    if (!confirm(`"${s.title}" 의 간행물을 ${name ?? "없음"}으로 바꿀까요?\n앱 시리즈 화면 제목 아래 줄과 "${name ?? "…"}의 다른 시리즈" 묶음에 바로 반영됩니다. 편 썸네일은 바뀌지 않습니다.`)) return;
    setBusy(true); setMsg(null);
    try {
      const next = await patchEarSeries(s.id, { publisher_name: name });
      onChange(next);
      setMsg({ text: `간행물 → ${name ?? "없음"}`, bad: false });
    } catch (e) { setMsg({ text: earErrMsg(e), bad: true }); }
    finally { setBusy(false); }
  }
  return (
    <tr className="align-top hover:bg-[#f7f9fb]">
      <Td><div className="font-medium">{s.title}</div><div className="mt-0.5 max-w-md text-[11px] text-ink-soft">{s.description}</div></Td>
      <Td className="whitespace-nowrap text-xs">{s.total_episodes}편 · 발행 {c.published}{c.withdrawn ? ` · 회수 ${c.withdrawn}` : ""}{c.expired ? ` · 만료 ${c.expired}` : ""}</Td>
      <Td className="whitespace-nowrap text-xs">{s.status === "completed" ? "완결" : "연재 중"}</Td>
      <Td className="whitespace-nowrap text-xs">
        <select className="rounded border border-line px-1.5 py-1 text-[12px] outline-none focus:border-brand" disabled={busy} value={current?.key ?? (unknown ? "__other" : "")} onChange={(e) => void setPublication(e.target.value)}>
          <option value="">없음</option>
          {options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
          {unknown && <option value="__other" disabled>{s.publisher_name} (목록 밖)</option>}
        </select>
      </Td>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <Td>{s.cover_url ? <img src={s.cover_url} alt="" className="h-16 w-16 rounded object-cover ring-1 ring-line" /> : <span className="text-[11px] text-amber-700">없음 (1화 썸네일 사용)</span>}</Td>
      <Td>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept="image/png,image/jpeg,image/webp" className="text-[11px]" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className={btnCls("primary")} disabled={busy || !file} onClick={() => void upload()}>{busy ? "올리는 중…" : "표지 올리기"}</button>
          {msg && <span className={`text-[11px] ${msg.bad ? "text-rose-700" : "text-emerald-700"}`}>{msg.text}</span>}
        </div>
      </Td>
    </tr>
  );
}
