import { supabaseServer } from "@/lib/supabase-server";
import { TopicsTable } from "./topics-table";
import { PageHeader, Panel } from "@/components/ui";
import { majorOrder } from "@/lib/taxonomy";

export default async function TopicsPage() {
  const sb = await supabaseServer();
  const { data } = await sb.from("topics").select("id,major,mid,ai_generation,explainer,active,note").order("created_at");
  const rows = [...(data ?? [])].sort((a, b) => majorOrder(a.major) - majorOrder(b.major)); // 대분류는 체계 순서, 안에서는 등록 순
  return (
    <div className="space-y-3">
      <PageHeader title="주제 체계" breadcrumb={["파이프라인", "주제"]} desc="주제 체계의 단일 진실 원천 (PIPELINE 1장). 중분류 추가·변경, AI 생성 배제 여부, 해설 페르소나를 여기서 관리한다. 변경 시 소스 풀의 커버리지와 페르소나 관할(spec/04)도 함께 갱신한다." />
      <Panel flush><TopicsTable rows={rows} /></Panel>
    </div>
  );
}
