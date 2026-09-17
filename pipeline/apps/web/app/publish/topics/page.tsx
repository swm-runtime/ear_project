"use client";
import { useCallback, useEffect, useState } from "react";
import { EarTopic, createEarTopic, deleteEarTopic, listEarTopics, patchEarTopic } from "@/lib/ear";
import { PageHeader, Panel, Toolbar, btnCls } from "@/components/ui";
import { EarGate, EarSession, earErrMsg } from "../ear-connect";
import { listPipelineTopicsForSync } from "../../actions";

/**
 * 제품 주제 관리 (admin.md 4.5) — **앱 사용자에게 보이는 제품 쪽 주제**. 파이프라인 주제 체계(/topics)의
 * 중분류와 이름·대분류를 1:1 로 맞추는 게 규약이라(2026-09-06 체계 통일) [체계와 맞추기]로 차이를 미리 보고 반영한다.
 * 새 주제는 숨김으로 생기고, 콘텐츠가 쌓인 뒤 노출을 켠다 — 노출을 켜는 것은 여기서 사람만 한다.
 * **노출 가능 콘텐츠(발행 중 + 라이선스 미만료)가 0건이면 켤 수 없다**(서버 409 `ADMIN_TOPIC_HAS_NO_CONTENTS`),
 * 노출 중인 주제가 회수·만료로 0건이 되면 서버가 자동으로 숨긴다(KAN-58). 다시 켜는 것은 사람이다.
 */
export default function EarTopicsPage() {
  return (
    <div className="space-y-3">
      <PageHeader title="제품 주제" breadcrumb={["파이프라인", "제품 발행", "제품 주제"]}
        desc="앱 온보딩·탐색에 쓰이는 제품 쪽 주제. 파이프라인 주제 체계(/topics)의 중분류·대분류와 1:1 로 맞춘다 — [체계와 맞추기]가 없는 주제를 숨김으로 만들고 대분류·정렬을 맞춘다. 노출 여부만 사람이 켠다 — 노출 가능 콘텐츠(발행 중·라이선스 유효)가 0건이면 켤 수 없고, 노출 중에 0건이 되면 자동으로 숨겨진다. 콘텐츠가 있는 주제는 삭제할 수 없다(숨김 권장)."
        actions={<EarSession />} />
      <EarGate><TopicTable /></EarGate>
    </div>
  );
}

type SyncPlan = {
  create: { major: string; mid: string; display_order: number }[];
  patch: { id: string; name: string; fields: { parent_category?: string; display_order?: number }; before: EarTopic }[];
  extra: EarTopic[];
};

function TopicTable() {
  const [rows, setRows] = useState<EarTopic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<SyncPlan | null>(null);

  const load = useCallback(async () => {
    try { const r = await listEarTopics(); setErr(null); setRows(r.items); } catch (e) { setErr(earErrMsg(e)); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]); // 동기 setState 회피 (react-hooks/set-state-in-effect)

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { alert(earErrMsg(e)); } finally { setBusy(false); }
  }

  /** 파이프라인 체계와 대조 — 없는 주제는 생성(숨김), 대분류·정렬이 다르면 수정, 체계에 없는 제품 주제는 알려만 준다(삭제·숨김은 사람) */
  async function preview() {
    setBusy(true);
    try {
      const want = await listPipelineTopicsForSync();
      const have = rows ?? (await listEarTopics()).items;
      const byName = new Map(have.map((t) => [t.name, t]));
      const create = want.filter((w) => !byName.has(w.mid));
      const patch = want.flatMap((w) => {
        const t = byName.get(w.mid);
        if (!t) return [];
        const fields: { parent_category?: string; display_order?: number } = {};
        if (t.parent_category !== w.major) fields.parent_category = w.major;
        if (t.display_order !== w.display_order) fields.display_order = w.display_order;
        return Object.keys(fields).length ? [{ id: t.id, name: t.name, fields, before: t }] : [];
      });
      const wantNames = new Set(want.map((w) => w.mid));
      const extra = have.filter((t) => !wantNames.has(t.name));
      setPlan({ create, patch, extra });
    } catch (e) { alert(earErrMsg(e)); } finally { setBusy(false); }
  }

  async function apply() {
    if (!plan) return;
    await act(async () => {
      for (const c of plan.create) await createEarTopic(c.mid, c.major, c.display_order);
      for (const p of plan.patch) await patchEarTopic(p.id, p.fields);
    });
    setPlan(null);
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
        <span className="ml-auto" />
        <button className={btnCls()} disabled={busy || rows == null} onClick={() => void preview()}>파이프라인 체계와 맞추기</button>
      </Toolbar>
      {plan && (
        <Panel title="체계 대조 결과 — 반영 전 확인">
          <div className="space-y-2 text-[13px]">
            <p><b>생성 {plan.create.length}건</b> (숨김으로) — {plan.create.length ? plan.create.map((c) => `${c.major} › ${c.mid}`).join(", ") : "없음"}</p>
            <p><b>수정 {plan.patch.length}건</b> — {plan.patch.length ? plan.patch.map((p) => `${p.name}: ${[p.fields.parent_category != null ? `대분류 ${p.before.parent_category} → ${p.fields.parent_category}` : "", p.fields.display_order != null ? `정렬 ${p.before.display_order} → ${p.fields.display_order}` : ""].filter(Boolean).join(" · ")}`).join(", ") : "없음"}</p>
            <p><b>체계에 없는 제품 주제 {plan.extra.length}건</b> (자동으로 손대지 않음 — 콘텐츠가 없으면 삭제, 있으면 숨김) — {plan.extra.length ? plan.extra.map((t) => `${t.name}(${t.content_count}건${t.is_visible ? ", 노출 중" : ""})`).join(", ") : "없음"}</p>
            <div className="flex gap-2 pt-1">
              <button className={btnCls("primary")} disabled={busy || (plan.create.length + plan.patch.length === 0)} onClick={() => void apply()}>반영</button>
              <button className={btnCls()} disabled={busy} onClick={() => setPlan(null)}>닫기</button>
            </div>
          </div>
        </Panel>
      )}
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
                <td className="px-4 py-2.5 tabular-nums text-ink-soft" title="발행 중 / 전체 연결(회수·만료 포함 — 삭제 판정 기준)">
                  {t.visible_content_count ?? "?"} / {t.content_count}
                </td>
                <td className="px-4 py-2.5">
                  {(() => {
                    // 숨김 → 노출만 막는다. 노출 중인 0건 주제(규칙 이전에 켜진 것)는 끌 수 있어야 한다
                    const blocked = !t.is_visible && t.visible_content_count === 0;
                    return (
                      <label className="flex items-center gap-1.5 text-xs" title={blocked ? "콘텐츠가 0건이라 노출할 수 없어요. 콘텐츠를 먼저 발행해주세요" : undefined}>
                        <input type="checkbox" checked={t.is_visible} disabled={busy || blocked} onChange={(e) => {
                          const on = e.target.checked;
                          // 규칙 배포 전 서버(운영은 main 머지 때 반영)는 막지 않는다 — 그동안은 종전 확인창으로 버틴다
                          if (on && t.visible_content_count === undefined && t.content_count === 0 && !confirm(`"${t.name}"에 콘텐츠가 0건이에요. 그래도 켤까요?`)) { e.target.checked = false; return; }
                          // 409 가 오면 act 가 서버 문구를 띄우고 목록을 다시 읽어 체크를 되돌린다
                          void act(() => patchEarTopic(t.id, { is_visible: on }));
                        }} />
                        {t.is_visible ? "노출" : blocked ? "숨김 (콘텐츠 0건)" : "숨김"}
                      </label>
                    );
                  })()}
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
