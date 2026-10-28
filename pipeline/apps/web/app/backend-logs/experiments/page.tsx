import { PageHeader, Panel } from "@/components/ui";
import { SignupFunnel } from "@/components/signup-funnel";

export const dynamic = "force-dynamic";

/**
 * 실험 지표 — 팀원 누구나 보고 싶은 지표를 자유롭게 추가해 보는 탭(2026-10-28).
 *
 * "서비스 지표" 탭이 팀이 함께 보는 **공식 지표**라면, 이 탭은 **비공식 지표 모음**이다.
 * 실험을 준비하며 확인할 지표, 실험과 상관없이 궁금한 지표를 각자 올린다.
 * 써 보고 계속 볼 가치가 있는 지표는 "서비스 지표"로 옮긴다.
 *
 * ## 지표를 추가하는 규칙 (누가 추가하든 같은 모양으로)
 * 지표 하나에 카드 하나를 둔다. 숫자만 올리면 다른 사람이 왜 보는지 알 수 없으므로 아래 정보를 함께 적는다.
 *
 * | 항목 | 필수 | 쓰는 법 |
 * |---|---|---|
 * | `name` | ✓ | 지표 이름 — 무엇을 세는지 한 줄(예: "첫 재생 편 30초 이탈률") |
 * | `why` | ✓ | 이 지표를 보는 이유 — 무엇이 궁금한지, 숫자를 보고 무엇을 판단할지 |
 * | `owner` | ✓ | 추가한 사람 — 정의를 물어볼 사람 |
 * | `definition` | ✓ | 정확한 정의 — 분모·분자·기간·대상(시장·가입 시점 등). 공식 지표와 이름이 겹치면 차이를 적는다 |
 * | `experiment` |  | 관련 실험 — 실험에 쓰는 지표일 때만 적는다(실험 기록의 이름과 같게) |
 * | `note` |  | 메모 — 기준값, 참고할 점, 한계 등 |
 *
 * 실제 숫자(현재값)는 관리자 API 로 붙인다. 그 전까지는 아래 `EXPERIMENT_METRICS` 에 카드 정의만 둔다.
 * 숫자를 붙인 지표는 패널로 그리고, 패널 위에 같은 정보(보는 이유·추가한 사람·정의)를 `MetricInfo`로 적는다.
 *
 * ## 숫자가 붙은 지표
 * - 가입 퍼널(`GET /admin/insights/funnel`, 2026-10-28) — 가입한 사람이 어느 단계에서 가장 많이 빠지나. `components/signup-funnel.tsx`
 */
interface ExperimentMetric {
  name: string;
  why: string;
  owner: string;
  definition: string;
  experiment?: string;
  note?: string;
}

/**
 * 등록된 지표 — 보고 싶은 지표가 생기면 여기에 하나씩 추가한다. 모양은 위 표를 따른다.
 *
 * 예)
 * {
 *   name: "첫 재생 편 30초 이탈률",
 *   why: "첫 편을 앞부분에서 끄는 사람이 많아 보인다. 도입부를 바꿀지 판단하려고 본다",
 *   owner: "박수헌",
 *   definition: "가입 뒤 처음 재생한 편에서 30초 안에 멈춘 사람 ÷ 첫 재생한 사람 (KR · 최근 14일 가입자)",
 *   experiment: "첫 편 도입부 개선",
 *   note: "10-14~10-27 가입자 기준 48%",
 * },
 */
const EXPERIMENT_METRICS: ExperimentMetric[] = [];

const FIELDS: { key: keyof ExperimentMetric; label: string }[] = [
  { key: "why", label: "보는 이유" },
  { key: "owner", label: "추가한 사람" },
  { key: "definition", label: "정의" },
  { key: "experiment", label: "관련 실험" },
  { key: "note", label: "메모" },
];

export default function ExperimentMetricsPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="실험 지표"
        breadcrumb={["백엔드 로그", "실험 지표"]}
        desc="누구나 보고 싶은 지표를 추가해 보는 곳. 실험에 필요한 지표도, 실험과 상관없이 궁금한 지표도 올린다. 공식 지표는 '서비스 지표' 탭에서 본다."
      />

      <Panel title="지표를 추가할 때 적는 정보">
        <p className="text-[13px] text-ink-soft">
          지표 하나에 카드 하나. 숫자만 올리면 다른 사람이 왜 보는지 알 수 없으니 아래 정보를 함께 적는다. 계속 볼 가치가 있는 지표는 &lsquo;서비스 지표&rsquo;로 옮긴다.
        </p>
        <ul className="mt-2 grid gap-1 text-[13px] md:grid-cols-2">
          <li><b>보는 이유</b> — 무엇이 궁금한지, 숫자를 보고 무엇을 판단할지</li>
          <li><b>추가한 사람</b> — 정의를 물어볼 사람</li>
          <li><b>정의</b> — 분모 · 분자 · 기간 · 대상 (공식 지표와 이름이 겹치면 차이를 적는다)</li>
          <li><b>관련 실험</b> (선택) — 실험에 쓰는 지표일 때</li>
          <li><b>메모</b> (선택) — 기준값, 참고할 점, 한계</li>
        </ul>
      </Panel>

      <Panel title="가입 퍼널 — 가입한 사람은 어느 단계에서 가장 많이 빠지나">
        <MetricInfo
          why="가입 뒤 어느 단계에서 가장 많이 빠지는지 보고, 실험할 곳을 고른다. 실험 뒤에는 그 단계의 남는 비율이 올랐는지 본다"
          owner="박준현"
          definition="가입 주(월 05시 시작) 묶음별로 온보딩 완료 → 24시간 안 첫 재생 → 첫 완청 → W1 복귀 → 14일 습관 → 결제에 이른 사람 수. 끝난 묶음만 합쳐 앞 단계 대비 남는 비율을 낸다(현재 계정 기준)"
        />
        <div className="mt-3"><SignupFunnel /></div>
      </Panel>

      <Panel title={`등록된 지표 ${EXPERIMENT_METRICS.length}개`}>
        {EXPERIMENT_METRICS.length === 0 ? (
          <p className="text-[13px] text-ink-soft">아직 등록된 지표가 없다. 보고 싶은 지표가 생기면 여기에 카드로 추가한다.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {EXPERIMENT_METRICS.map((m) => (
              <div key={m.name} className="rounded-md border border-line px-4 py-3">
                <div className="text-sm font-semibold">{m.name}</div>
                <dl className="mt-2 space-y-1 text-[13px]">
                  {FIELDS.filter((f) => m[f.key]).map((f) => (
                    <div key={f.key} className="flex gap-2">
                      <dt className="w-20 shrink-0 text-ink-soft">{f.label}</dt>
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

/** 숫자가 붙은 지표 패널 위에 두는 정보 줄 — 카드와 같은 항목(보는 이유·추가한 사람·정의) */
function MetricInfo({ why, owner, definition }: Pick<ExperimentMetric, "why" | "owner" | "definition">) {
  return (
    <dl className="grid gap-1 text-[13px]">
      {([["보는 이유", why], ["추가한 사람", owner], ["정의", definition]] as const).map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <dt className="w-20 shrink-0 text-ink-soft">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
