import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader, Panel } from "@/components/ui";
import { TopicSeedForm } from "../sweep-form";
import { loadSweepData, SweepJobsPanel } from "../shared";

/** 주제 기획 (모드 B-②, 2026-09-26): 주제를 주면 소스를 찾아 후보 하나를 세운다 — 순서가 뒤집힌 군집화 */
export default async function TopicSeedPage() {
  const { mids, jobs, runs } = await loadSweepData("topic");
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
      <PageHeader title="주제 기획" breadcrumb={["파이프라인", "스윕·군집화", "주제 기획"]} desc="주제를 정하면 AI가 웹 검색으로 소스를 모아 후보 하나를 백로그에 올린다(spec/02 모드 B-②). 승인 뒤는 기존 흐름과 같다." />
      <TopicSeedForm mids={mids} />
      <Panel title="이 모드의 규칙" className="text-[12.5px] text-ink-soft">
        <ul className="list-disc space-y-1 pl-5">
          <li>소스는 <b>풀에 가두지 않는다</b> — 공공·연구·대학·학회·오픈액세스·기업 공식을 우선하되 어느 발행처든 좋다. 차단·보류 도메인, robots 불허, 유료 DB·구독 벽은 뺀다.</li>
          <li>풀 밖 도메인은 소스 풀에 <code>candidate</code>(미판정)로 등록되고 소스도 바로 적재된다. 판정은 소스 풀 화면에서 사람이 한다.</li>
          <li>후보는 먼저 <b>보류</b>(🔎 검색 진행 중)로 생기고, 판정이 성립이면 <b>승인 대기</b>로 올라간다. 미달이면 보류에 빈 역할이 적히고 [보강]을 한 번 더 쓸 수 있다.</li>
          <li>기존 후보와 겹치면 후보를 지우지 않고 메모에 겹치는 후보를 적는다 — 판단은 사람이 한다.</li>
          <li>웹 검색이 필요해 노트북 Claude 워커만 집는다. 편당 검색 8회 + 판정 1회, $1 안팎.</li>
        </ul>
      </Panel>
      <SweepJobsPanel jobs={jobs} runs={runs} />
    </div>
  );
}
