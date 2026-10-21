"use client";
import { useCallback, useEffect, useState } from "react";
import { EarSeries, listEarSeries, putEarSeriesCover } from "@/lib/ear";
import { EarGate, earErrMsg } from "@/app/publish/ear-connect";
import { btnCls, Panel, Table, Td } from "@/components/ui";

/**
 * 제품 시리즈 표지 (2026-10-22, KAN-234·KAN-136) — 운영 서버의 시리즈 목록(`GET /admin/series`)과 표지를 보여 주고, 파일을 골라 `PUT /admin/series/:id/cover` 로 올린다.
 * 파이프라인 밖에서 묶인 시리즈(CS 16편 · 경제 상식 · 철학 — BE 일회성 마이그레이션)는 [시리즈 발행]을 거치지 않아 표지를 올릴 곳이 여기뿐이다.
 * 표지가 없으면 앱은 가장 앞 편 썸네일을 쓴다 — 편 썸네일에 번호("01")가 찍히는 디자인이면 표지를 따로 올려야 한다(spec/11 7장).
 */
export function ProductSeriesCovers() {
  return (
    <Panel title="제품 시리즈 표지 (운영)" right={<span className="text-[11px] text-ink-soft">표지가 없으면 앱은 가장 앞 편 썸네일을 쓴다</span>}>
      <EarGate><CoverTable /></EarGate>
    </Panel>
  );
}

function CoverTable() {
  const [items, setItems] = useState<EarSeries[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setItems((await listEarSeries()).items); setErr(null); } catch (e) { setErr(earErrMsg(e)); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]); // 동기 setState 회피 (react-hooks/set-state-in-effect)
  if (err) return <p className="text-[12.5px] text-rose-700">{err}</p>;
  if (!items) return <p className="text-[12.5px] text-ink-soft">시리즈 목록 읽는 중…</p>;
  return (
    <Table head={["시리즈", "편수", "상태", "표지", ""]} empty="제품에 시리즈가 없다">
      {items.map((s) => <CoverRow key={s.id} s={s} onChange={(next) => setItems((cur) => (cur ?? []).map((x) => (x.id === next.id ? next : x)))} />)}
    </Table>
  );
}

function CoverRow({ s, onChange }: { s: EarSeries; onChange: (s: EarSeries) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const c = s.episode_counts;
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
  return (
    <tr className="align-top hover:bg-[#f7f9fb]">
      <Td><div className="font-medium">{s.title}</div><div className="mt-0.5 max-w-md text-[11px] text-ink-soft">{s.description}</div></Td>
      <Td className="whitespace-nowrap text-xs">{s.total_episodes}편 · 발행 {c.published}{c.withdrawn ? ` · 회수 ${c.withdrawn}` : ""}{c.expired ? ` · 만료 ${c.expired}` : ""}</Td>
      <Td className="whitespace-nowrap text-xs">{s.status === "completed" ? "완결" : "연재 중"}</Td>
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
