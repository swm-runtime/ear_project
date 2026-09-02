"use client";
import { useCallback, useEffect, useState } from "react";
import { EarTopic, createEarTopic, deleteEarTopic, listEarTopics, patchEarTopic } from "@/lib/ear";
import { PageHeader, Panel, Toolbar, btnCls } from "@/components/ui";
import { EarGate, EarSession, earErrMsg } from "../ear-connect";

/**
 * 제품 주제 관리 (admin.md 4.5) — 파이프라인의 주제 체계(/topics)와 다른, **앱 사용자에게
 * 보이는 제품 쪽 주제**다. 새 주제는 숨김으로 생기고, 콘텐츠가 쌓인 뒤 노출을 켠다.
 */
export default function EarTopicsPage() {
  return (
    <div className="space-y-3">
      <PageHeader title="제품 주제" breadcrumb={["파이프라인", "제품 발행", "제품 주제"]}
        desc="앱 온보딩·탐색에 쓰이는 제품 쪽 주제. 파이프라인의 주제 체계(중분류)와는 별개 축이다. 콘텐츠가 있는 주제는 삭제할 수 없다(숨김 권장)."
        actions={<EarSession />} />
      <EarGate><TopicTable /></EarGate>
    </div>
  );
}

function TopicTable() {
  const [rows, setRows] = useState<EarTopic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await listEarTopics(); setErr(null); setRows(r.items); } catch (e) { setErr(earErrMsg(e)); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]); // 동기 setState 회피 (react-hooks/set-state-in-effect)

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { alert(earErrMsg(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <Toolbar>
        <input className="rounded border border-line px-2.5 py-1.5 text-xs" placeholder="주제명" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded border border-line px-2.5 py-1.5 text-xs" placeholder="대분류" value={cat} onChange={(e) => setCat(e.target.value)} />
        <button className={btnCls("primary")} disabled={busy || !name.trim() || !cat.trim()}
          onClick={() => void act(async () => { await createEarTopic(name.trim(), cat.trim()); setName(""); setCat(""); })}>
          추가 (숨김으로 생성)
        </button>
      </Toolbar>
      {err && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{err}</p>}
      <Panel flush>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
              {["주제", "대분류", "정렬", "콘텐츠", "노출", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-[#f7f9fb]">
                <td className="px-4 py-2.5 font-medium text-ink">{t.name}</td>
                <td className="px-4 py-2.5 text-ink-soft">{t.parent_category}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-soft">{t.display_order}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-soft">{t.content_count}</td>
                <td className="px-4 py-2.5">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={t.is_visible} disabled={busy} onChange={(e) => {
                      const on = e.target.checked;
                      if (on && t.content_count === 0 && !confirm(`"${t.name}"에 콘텐츠가 0건이에요. 노출하면 "고를 수는 있는데 볼 게 없는 주제"가 생겨요. 그래도 켤까요?`)) { e.target.checked = false; return; }
                      void act(() => patchEarTopic(t.id, { is_visible: on }));
                    }} />
                    {t.is_visible ? "노출" : "숨김"}
                  </label>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button className={btnCls("danger")} disabled={busy} onClick={() => {
                    if (!confirm(`"${t.name}" 주제를 삭제할까요?`)) return;
                    void act(() => deleteEarTopic(t.id));
                  }}>삭제</button>
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-soft">주제가 없습니다.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
