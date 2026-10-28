import { PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * 실험 지표 — 최종 발표 전 2주 동안 돌리는 실험마다 필요한 지표를 한곳에 모으는 탭(2026-10-28). 지금은 틀만 있고,
 * 실험이 정해지면 실험마다 패널을 하나씩 붙인다(가설 · 바꾼 것 · 핵심 지표 · 기준값 · 목표 · 기간).
 */
export default function ExperimentMetricsPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="실험 지표"
        breadcrumb={["백엔드 로그", "실험 지표"]}
        desc="진행 중인 실험별 핵심 지표. 실험마다 가설 · 바꾼 것 · 기준값 · 목표를 함께 적고, 시작 전후를 같은 기준으로 비교한다."
      />
      <Panel title="진행 중인 실험">
        <p className="text-[13px] text-ink-soft">아직 등록된 실험이 없다 — 실험이 정해지면 여기에 실험별 지표 패널이 붙는다.</p>
      </Panel>
    </div>
  );
}
