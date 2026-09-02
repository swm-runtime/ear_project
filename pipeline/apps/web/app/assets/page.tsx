import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { ASSET_KEYS } from "@/lib/assets";
import { Badge, PageHeader, Table, Td, Tr } from "@/components/ui";

type Row = { key: string; version: string; status: "draft" | "active" | "retired"; note: string | null; created_by: string | null; created_at: string; activated_at: string | null; activated_by: string | null };
const ts = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "-");

/** 규칙 자산 (spec/10 3.2) — 워커가 모델에게 건네는 7개 자산의 진실. 편집·새 버전·활성화는 상세 화면에서 */
export default async function AssetsPage() {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("prompt_assets").select("key,version,status,note,created_by,created_at,activated_at,activated_by").order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  const byKey = new Map<string, Row[]>();
  for (const r of rows) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  const missing = ASSET_KEYS.filter((a) => !byKey.get(a.key)?.some((r) => r.status === "active"));
  return (
    <div className="space-y-4">
      <PageHeader title="규칙 자산" breadcrumb={["파이프라인", "규칙 자산"]}
        desc="워커가 대본 생성·QA·비평 때 모델에게 건네는 규칙의 진실 (spec/10 3.2). 새 버전을 draft 로 저장하고 활성화하면 다음 작업부터 모든 워커가 그 버전을 읽는다 — pull·재시작 없음. 진행 중이던 에피소드는 시작할 때의 버전을 끝까지 쓴다." />
      {error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">읽기 실패: {error.message} — 0009 마이그레이션이 적용됐는지 확인</p>}
      {!error && missing.length > 0 && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          active 가 없는 자산 {missing.length}개 — 워커는 이 상태에서 AI 작업을 시작하지 않는다. 최초 1회 <code>npm run assets:import</code> 로 git 사본을 시딩한다: {missing.map((m) => m.label).join(" · ")}
        </p>
      )}
      <Table head={["자산", "active 버전", "활성화", "누가", "draft", "최근 사유"]} empty="자산 없음 — npm run assets:import">
        {ASSET_KEYS.map((a) => {
          const list = byKey.get(a.key) ?? [];
          const active = list.find((r) => r.status === "active");
          const drafts = list.filter((r) => r.status === "draft").length;
          return (
            <Tr key={a.key} href={`/assets/${a.key}`}>
              <Td><Link href={`/assets/${a.key}`} className="font-medium text-brand hover:underline">{a.label}</Link><span className="ml-2 font-mono text-[11px] text-ink-soft">{a.key}</span></Td>
              <Td>{active ? <Badge tone="active">{active.version}</Badge> : <Badge tone="failed">없음</Badge>}</Td>
              <Td className="whitespace-nowrap text-xs text-ink-soft">{ts(active?.activated_at ?? null)}</Td>
              <Td className="text-xs text-ink-soft">{active?.activated_by ?? "-"}</Td>
              <Td>{drafts > 0 ? <Badge tone="draft">{`draft ${drafts}`}</Badge> : <span className="text-xs text-ink-soft">-</span>}</Td>
              <Td className="max-w-[26rem] truncate text-xs text-ink-soft" >{active?.note ?? "-"}</Td>
            </Tr>
          );
        })}
      </Table>
      <p className="text-xs text-ink-soft">git 의 <code>docs/ai/skills/</code> 는 export 스냅샷이다 — <code>npm run assets:export</code> 로 active 를 내려받아 PR 에서 diff 를 본다. spec/03·04·05 본문은 git 이 진실(하이브리드).</p>
    </div>
  );
}
