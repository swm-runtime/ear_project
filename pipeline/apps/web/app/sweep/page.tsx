import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/ui";
import { SweepForm } from "./sweep-form";
import { loadSweepData, SweepJobsPanel } from "./shared";

/** 스윕 (모드 A · B-① 보강) — 군집화는 /sweep/cluster, 주제 기획은 /sweep/topic (2026-09-26 분리) */
export default async function SweepPage() {
  const { mids, jobs, runs } = await loadSweepData("sweep");
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
      <PageHeader title="스윕" breadcrumb={["파이프라인", "스윕·군집화", "스윕"]} desc="풀 안 원천의 RSS 메타데이터만 수집(spec/02 모드 A)하고, 끝나면 군집화 v2가 자동으로 이어져 백로그에 후보가 올라온다. 후보 보강(모드 B-①)은 백로그 카드의 [보강]." />
      <SweepForm mids={mids} />
      <SweepJobsPanel jobs={jobs} runs={runs} />
    </div>
  );
}
