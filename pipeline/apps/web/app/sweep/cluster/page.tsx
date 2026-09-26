import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/ui";
import { ClusterForm } from "../sweep-form";
import { loadSweepData, SweepJobsPanel } from "../shared";

/** 군집화 v2 수동 요청 — 스윕 뒤 자동으로도 걸리지만, 풀만 다시 훑고 싶을 때 여기서 건다 */
export default async function ClusterPage() {
  const { mids, majorOfMid, jobs, runs } = await loadSweepData("cluster");
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
      <PageHeader title="군집화" breadcrumb={["파이프라인", "스윕·군집화", "군집화"]} desc="축(대립·역설·재정의)을 먼저 세우고 역할·다양성으로 후보를 만든다(spec/03 2장 v2). AI 작업이라 워커가 떠 있어야 진행된다. 설정의 서버 AI 집기 스위치가 꺼져 있으면 노트북 Claude 워커가 집는다." />
      <ClusterForm mids={mids} majorOfMid={majorOfMid} />
      <SweepJobsPanel jobs={jobs} runs={runs} />
    </div>
  );
}
