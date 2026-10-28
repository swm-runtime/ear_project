import { PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * 실험 지표 — 최종 발표 전 2주 동안 돌리는 실험마다 필요한 지표를 한곳에 모으는 탭(2026-10-28).
 *
 * ## 지표를 추가하는 규칙 (누가 추가하든 같은 모양으로)
 * 지표 하나 = 카드 하나이고, 카드에는 아래 정보를 **반드시 함께** 적는다. 숫자만 있고 "왜 보는지"가 없으면
 * 다른 사람이 읽고 판단할 수 없다(멘토 피드백 — "지표는 많은데 가설·행동으로 이어지지 않는다").
 *
 * | 항목 | 쓰는 법 |
 * |---|---|
 * | `name` | 지표 이름 — 무엇을 세는지 한 줄(예: "첫 재생 편 30초 이탈률") |
 * | `why` | 이 지표를 보는 이유 — 어떤 가설을 확인하려는지, 나빠지면/좋아지면 무엇을 할지 |
 * | `experiment` | 관련 실험 이름 — 실험 기록(Jira·문서)의 이름과 같게 |
 * | `owner` | 담당자 — 실험을 굴리고 숫자를 읽는 사람 |
 * | `definition` | 정확한 정의 — 분모·분자·기간·대상(시장·가입 시점 등). 같은 이름으로 다르게 세지 않게 |
 * | `baseline` | 실험 전 기준값과 측정 기간 |
 * | `target` | 성공 기준 — 이 값을 넘으면 실험이 맞았다고 본다 |
 * | `period` | 실험 기간(시작~끝) — 시작 전후를 같은 기준으로 비교한다 |
 *
 * 실제 숫자(현재값)는 실험이 정해진 뒤 관리자 API 로 붙인다. 그 전까지는 아래 `EXPERIMENT_METRICS` 에 카드 정의만 둔다.
 */
interface ExperimentMetric {
  name: string;
  why: string;
  experiment: string;
  owner: string;
  definition: string;
  baseline: string;
  target: string;
  period: string;
}

/**
 * 등록된 실험 지표 — 실험이 정해지면 여기에 하나씩 추가한다. 모양은 위 표를 따른다.
 *
 * 예)
 * {
 *   name: "첫 재생 편 30초 이탈률",
 *   why: "첫 편을 앞부분에서 끄는 사람이 많다(첫 재생의 40~52%가 10% 미만 도달). 앞 30초를 바꾸면 줄어드는지 본다",
 *   experiment: "첫 편 도입부 개선",
 *   owner: "박수헌",
 *   definition: "가입 뒤 처음 재생한 편에서 30초 안에 멈춘 사람 ÷ 첫 재생한 사람 (KR · 실험 기간 가입자)",
 *   baseline: "48% (10-14~10-27 가입자)",
 *   target: "35% 이하",
 *   period: "10-30 ~ 11-09",
 * },
 */
const EXPERIMENT_METRICS: ExperimentMetric[] = [];

const FIELDS: { key: keyof ExperimentMetric; label: string }[] = [
  { key: "why", label: "보는 이유" },
  { key: "experiment", label: "관련 실험" },
  { key: "owner", label: "담당자" },
  { key: "definition", label: "정의" },
  { key: "baseline", label: "기준값" },
  { key: "target", label: "목표" },
  { key: "period", label: "기간" },
];

export default function ExperimentMetricsPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="실험 지표"
        breadcrumb={["백엔드 로그", "실험 지표"]}
        desc="진행 중인 실험별 핵심 지표. 지표마다 보는 이유 · 관련 실험 · 담당자 · 정의 · 기준값 · 목표 · 기간을 함께 적고, 시작 전후를 같은 기준으로 비교한다."
      />

      <Panel title="지표 카드에 들어가는 정보">
        <p className="text-[13px] text-ink-soft">
          지표 하나에 카드 하나를 둔다. 숫자만 두지 않고, 다른 사람이 읽고 판단할 수 있게 아래 정보를 함께 적는다.
        </p>
        <ul className="mt-2 grid gap-1 text-[13px] md:grid-cols-2">
          <li><b>보는 이유</b> — 어떤 가설을 확인하려는지, 나빠지면·좋아지면 무엇을 할지</li>
          <li><b>관련 실험</b> — 이 지표로 판단하는 실험 이름</li>
          <li><b>담당자</b> — 실험을 굴리고 숫자를 읽는 사람</li>
          <li><b>정의</b> — 분모 · 분자 · 기간 · 대상(같은 이름으로 다르게 세지 않게)</li>
          <li><b>기준값</b> — 실험 전 값과 측정 기간</li>
          <li><b>목표</b> — 이 값을 넘으면 실험이 맞았다고 본다</li>
          <li><b>기간</b> — 실험 시작 ~ 끝</li>
        </ul>
      </Panel>

      <Panel title={`진행 중인 실험 지표 ${EXPERIMENT_METRICS.length}개`}>
        {EXPERIMENT_METRICS.length === 0 ? (
          <p className="text-[13px] text-ink-soft">아직 등록된 실험 지표가 없다 — 실험이 정해지면 여기에 카드가 붙는다.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {EXPERIMENT_METRICS.map((m) => (
              <div key={m.name} className="rounded-md border border-line px-4 py-3">
                <div className="text-sm font-semibold">{m.name}</div>
                <dl className="mt-2 space-y-1 text-[13px]">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="flex gap-2">
                      <dt className="w-16 shrink-0 text-ink-soft">{f.label}</dt>
                      <dd>{m[f.key]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
