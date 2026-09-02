import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { assetLabel } from "@/lib/assets";
import { PageHeader, Panel } from "@/components/ui";
import { AssetEditor } from "./asset-editor";

type Row = { key: string; version: string; status: "draft" | "active" | "retired"; content: string; note: string | null; created_by: string | null; created_at: string; activated_at: string | null; activated_by: string | null };

export default async function AssetDetailPage({ params, searchParams }: { params: Promise<{ key: string[] }>; searchParams: Promise<{ v?: string; promote?: string }> }) {
  const { key: parts } = await params;
  const { v, promote } = await searchParams;
  const key = parts.map(decodeURIComponent).join("/");
  const sb = await supabaseServer();
  const { data, error } = await sb.from("prompt_assets").select("key,version,status,content,note,created_by,created_at,activated_at,activated_by").eq("key", key).order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  const active = rows.find((r) => r.status === "active") ?? null;
  const selected = (v ? rows.find((r) => r.version === v) : null) ?? active ?? rows[0] ?? null;
  return (
    <div className="space-y-4">
      <PageHeader title={assetLabel(key)} breadcrumb={["파이프라인", "규칙 자산", key]}
        desc="active 본문은 불변 — 고치려면 편집해서 새 버전(draft)으로 저장하고, 검토 후 활성화한다(사유 필수 = CHANGELOG). 활성화하면 다음 작업부터 모든 워커가 이 버전을 읽는다."
        actions={<Link href="/assets" className="text-[13px] text-ink-soft hover:underline">← 목록</Link>} />
      {error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error.message}</p>}
      {!selected ? (
        <Panel title="자산 없음"><p className="text-[13px] text-ink-soft">이 키의 버전이 DB 에 없다. <code>npm run assets:import</code> 로 git 사본을 시딩한다.</p></Panel>
      ) : (
        <AssetEditor
          assetKey={key}
          selected={{ version: selected.version, status: selected.status, content: selected.content, note: selected.note }}
          active={active ? { version: active.version, content: active.content } : null}
          history={rows.map(({ content: _c, ...r }) => r)}
          promote={!!promote}
        />
      )}
    </div>
  );
}
