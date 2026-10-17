import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader, Panel } from "@/components/ui";
import { GlobalTopicSeedForm, SeriesPlanForm, TopicSeedForm } from "../sweep-form";
import { pipelineLocale } from "@/lib/locale";
import { majorTopicsFor } from "@/lib/taxonomy";
import { loadSweepData, SweepJobsPanel } from "../shared";

/** 주제 기획 (모드 B-②, 2026-09-26): 주제를 주면 소스를 찾아 후보 하나를 세운다 — 순서가 뒤집힌 군집화 */
export default async function TopicSeedPage() {
  const { mids, jobs, runs } = await loadSweepData("topic");
  if (pipelineLocale() === "en") return <GlobalTopicSeedPage jobs={jobs} runs={runs} />;
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
      <PageHeader title="주제 기획" breadcrumb={["파이프라인", "스윕·군집화", "주제 기획"]} desc="주제를 정하면 AI가 웹 검색으로 소스를 모아 후보 하나를 백로그에 올린다(spec/02 모드 B-②). 승인 뒤는 기존 흐름과 같다." />
      <TopicSeedForm mids={mids} />
      <Panel title="시리즈로 시작" className="text-[12.5px] text-ink-soft"><p className="mb-3">처음부터 여러 편으로 기획할 주제는 여기서 시작한다(spec/11). AI가 편 목록 초안을 만들면 시리즈 화면에서 고쳐 승인한다. 편수 상한은 없다.</p><SeriesPlanForm topics={mids} en={false} /></Panel>
      <Panel title="이 모드의 규칙" className="text-[12.5px] text-ink-soft">
        <ul className="list-disc space-y-1 pl-5">
          <li>소스는 <b>풀에 가두지 않는다</b> — 공공·연구·대학·학회·오픈액세스·기업 공식을 우선하되 어느 발행처든 좋다. 차단·보류 도메인, robots 불허, 유료 DB·구독 벽은 뺀다.</li>
          <li>풀 밖 도메인은 소스 풀에 <code>candidate</code>(미판정)로 등록되고 소스도 바로 적재된다. 판정은 소스 풀 화면에서 사람이 한다.</li>
          <li>후보는 먼저 <b>보류</b>(🔎 검색 진행 중)로 생기고, 판정이 성립이면 <b>승인 대기</b>로 올라간다. 미달이면 보류에 빈 역할이 적히고 [보강]을 한 번 더 쓸 수 있다.</li>
          <li>기존 후보와 겹치면 후보를 지우지 않고 메모에 겹치는 후보를 적는다 — 판단은 사람이 한다.</li>
          <li>서버 워커(OpenAI 웹 검색)가 집는다. 편당 검색 8회 + 판정 1회.</li>
        </ul>
      </Panel>
      <SweepJobsPanel jobs={jobs} runs={runs} />
    </div>
  );
}

/** 글로벌판 (명세 6.1·4.4, 2026-10-15 KAN-209) — 주제 1~2개 · 배제 주제 입력 거부 · 서버 워커가 OpenAI 웹 검색으로 처리 */
function GlobalTopicSeedPage({ jobs, runs }: Pick<Awaited<ReturnType<typeof loadSweepData>>, "jobs" | "runs">) {
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
      <PageHeader title="주제 기획" breadcrumb={["파이프라인", "주제 기획"]} desc="글로벌판의 유일한 입구. 주제를 정하면 서버 워커가 웹 검색으로 소스를 모아 후보 하나를 백로그에 올린다(글로벌 명세 6.1)." />
      <GlobalTopicSeedForm topics={majorTopicsFor("en")} />
      <Panel title="시리즈로 시작" className="text-[12.5px] text-ink-soft"><p className="mb-3">여러 편으로 기획할 주제는 여기서 시작한다(글로벌 명세 6.11). AI가 영어 편 목록 초안을 만들면 시리즈 화면에서 고쳐 승인한다. 편수 상한은 없다.</p><SeriesPlanForm topics={majorTopicsFor("en")} en /></Panel>
      <Panel title="이 모드의 규칙" className="text-[12.5px] text-ink-soft">
        <ul className="list-disc space-y-1 pl-5">
          <li>입력하면 먼저 <b>배제 주제</b>(실존 인물 사안 · 진행 중 정치·군사 현안 · 홍보성)를 판정한다. 해당하면 작업을 만들지 않고 사유를 보인다.</li>
          <li>검색은 <b>8회 상한</b>이고 링크·제목·스니펫만 받는다. 차단·보류 도메인과 robots 불허는 빼고, 처음 보는 도메인은 <code>candidate</code>로 등록된다.</li>
          <li>게이트 1 [승인]은 경고(빈 역할·소스 겹침)를 확인해야 열린다. 도메인 판정은 기다리지 않는다 — 차단한 도메인의 소스는 초안이 쓰지 않는다. 자동 승인은 없다.</li>
          <li>노트북 워커 없이 서버 워커(OpenAI 웹 검색)가 집는다.</li>
        </ul>
      </Panel>
      <SweepJobsPanel jobs={jobs} runs={runs} />
    </div>
  );
}
