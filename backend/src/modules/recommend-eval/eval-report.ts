import { EvalReport, EvalVerdict, ListMetrics } from './recommend-eval.types';

/**
 * 통과 기준의 허용 폭(`docs/backend/recommendation-evaluation.md` 5장). **초기값이다** — 표본이 쌓이면 조정한다.
 * 전부 "기준선 대비 이만큼 넘게 나빠지면 실패"다. 좋아지는 방향은 막지 않는다.
 */
export const PASS_CRITERIA = {
  /** 백테스트 적중률을 통과 판정에 쓰는 최소 사례 수 — 미만이면 참고(경고)로만 싣는다 */
  minBacktestCases: 20,
  /** 백테스트 Hit@10 하락 허용 폭(절대값) */
  hitAt10Drop: 0.05,
  /** 편성분 내 거리(다양성) 하락 허용 폭 */
  intraListDistanceDrop: 0.05,
  /** 카탈로그 커버리지 하락 허용 폭 */
  catalogCoverageDrop: 0.05,
  /** 고갈률 상승 허용 폭 */
  exhaustionRateRise: 0.05,
  /** 페르소나별 좋아하는 주제 비율 하락 허용 폭 */
  likedTopicShareDrop: 0.1,
} as const;

/**
 * 판정 — **불변식·페르소나 검사는 절대 기준**(하나라도 실패면 불합격), **지표는 기준선 대비**다.
 * 기준선이 없으면 지표는 판정하지 않고 리포트에만 싣는다(첫 실행이 곧 기준선이다).
 */
export function buildVerdict(
  report: EvalReport,
  baseline: EvalReport | null,
): EvalVerdict {
  const failures: string[] = [];
  const warnings: string[] = [];

  for (const invariant of report.invariants) {
    if (!invariant.passed) {
      failures.push(`불변식 위반: ${invariant.name} (${invariant.detail})`);
    }
  }

  for (const persona of report.personas) {
    if (persona.skipped !== null) {
      warnings.push(`페르소나 ${persona.name} 건너뜀 — ${persona.skipped}`);
    }

    for (const check of persona.checks) {
      if (check.passed) {
        continue;
      }

      const line = `페르소나 ${persona.name}: ${check.name} (${check.detail})`;

      if (check.severity === 'soft') {
        warnings.push(`알려진 미달(soft) — ${line}`);
      } else {
        failures.push(line);
      }
    }
  }

  const backtest = report.backtest;

  if (backtest !== null) {
    if (backtest.cases < PASS_CRITERIA.minBacktestCases) {
      warnings.push(
        `백테스트 사례 ${backtest.cases}건 — ${PASS_CRITERIA.minBacktestCases}건 미만이라 적중률은 참고값이다`,
      );
    } else if (backtest.model.hitAt['10'] < backtest.popularity.hitAt['10']) {
      warnings.push(
        `개인화 순위의 Hit@10(${pct(backtest.model.hitAt['10'])})이 인기순(${pct(backtest.popularity.hitAt['10'])})보다 낮다`,
      );
    }
  }

  if (baseline === null) {
    warnings.push(
      '기준선 없음 — 지표는 판정하지 않았다(이 리포트가 기준선이 된다)',
    );
    return { passed: failures.length === 0, failures, warnings };
  }

  if (
    backtest !== null &&
    baseline.backtest !== null &&
    backtest.cases >= PASS_CRITERIA.minBacktestCases &&
    baseline.backtest.cases >= PASS_CRITERIA.minBacktestCases
  ) {
    const drop =
      baseline.backtest.model.hitAt['10'] - backtest.model.hitAt['10'];

    if (drop > PASS_CRITERIA.hitAt10Drop) {
      failures.push(
        `백테스트 Hit@10 하락 ${pct(baseline.backtest.model.hitAt['10'])} → ${pct(backtest.model.hitAt['10'])}`,
      );
    }
  }

  compareLists('시뮬레이션', report.simulation, baseline.simulation, failures);

  if (report.lists !== null && baseline.lists !== null) {
    compareLists('실사용자 편성분', report.lists, baseline.lists, failures);
  }

  for (const persona of report.personas) {
    const before = baseline.personas.find((row) => row.name === persona.name);

    if (
      before?.likedTopicShare != null &&
      persona.likedTopicShare != null &&
      before.likedTopicShare - persona.likedTopicShare >
        PASS_CRITERIA.likedTopicShareDrop
    ) {
      failures.push(
        `페르소나 ${persona.name}: 좋아하는 주제 비율 하락 ${pct(before.likedTopicShare)} → ${pct(persona.likedTopicShare)}`,
      );
    }
  }

  return { passed: failures.length === 0, failures, warnings };
}

function compareLists(
  label: string,
  now: ListMetrics,
  before: ListMetrics,
  failures: string[],
): void {
  if (
    now.intraListDistance !== null &&
    before.intraListDistance !== null &&
    before.intraListDistance - now.intraListDistance >
      PASS_CRITERIA.intraListDistanceDrop
  ) {
    failures.push(
      `${label}: 편성분 내 거리(다양성) 하락 ${before.intraListDistance.toFixed(3)} → ${now.intraListDistance.toFixed(3)}`,
    );
  }

  if (
    before.catalogCoverage - now.catalogCoverage >
    PASS_CRITERIA.catalogCoverageDrop
  ) {
    failures.push(
      `${label}: 카탈로그 커버리지 하락 ${pct(before.catalogCoverage)} → ${pct(now.catalogCoverage)}`,
    );
  }

  if (
    now.exhaustionRate - before.exhaustionRate >
    PASS_CRITERIA.exhaustionRateRise
  ) {
    failures.push(
      `${label}: 고갈률 상승 ${pct(before.exhaustionRate)} → ${pct(now.exhaustionRate)}`,
    );
  }
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const num = (value: number | null) => (value === null ? '–' : value.toFixed(3));
const delta = (now: number | null, before: number | null | undefined) => {
  if (now === null || before === null || before === undefined) {
    return '';
  }

  const diff = now - before;

  return Math.abs(diff) < 0.0005
    ? ' (=)'
    : ` (${diff > 0 ? '+' : ''}${diff.toFixed(3)})`;
};

/** PR 본문에 그대로 붙일 수 있는 마크다운 요약 */
export function formatReport(
  report: EvalReport,
  baseline: EvalReport | null,
): string {
  const lines: string[] = [];
  const verdict = report.verdict;

  lines.push(`## 추천 평가 — ${verdict.passed ? '통과' : '**실패**'}`);
  lines.push('');
  lines.push(
    `스냅샷 ${report.snapshot.environment} · ${report.snapshot.exportedAt} · 콘텐츠 ${report.snapshot.contents} · 주제 ${report.snapshot.topics} · 사용자 ${report.snapshot.users}` +
      ` | 코드 ${report.gitSha ?? '?'} | 시뮬레이션 ${report.options.simulationDays}일 · 자동 확장 ${report.options.autoExpandFeature ? '켬' : '끔'}` +
      (baseline ? ` | 기준선 ${baseline.gitSha ?? '?'}` : ' | 기준선 없음'),
  );

  if (report.backtest !== null) {
    const b = report.backtest;
    const base = baseline?.backtest ?? null;

    lines.push('');
    lines.push(
      `### 백테스트 — 스스로 고르고 완청한 콘텐츠 ${b.cases}건 (사용자 ${b.users}명, 정규 후보에 있던 비율 ${pct(b.reachableShare)})`,
    );
    lines.push('');
    lines.push('| 순위 방법 | Hit@2 | Hit@5 | Hit@10 | MRR |');
    lines.push('|---|---|---|---|---|');
    lines.push(
      `| **이 코드** | ${pct(b.model.hitAt['2'])} | ${pct(b.model.hitAt['5'])} | ${pct(b.model.hitAt['10'])}${delta(b.model.hitAt['10'], base?.model.hitAt['10'])} | ${num(b.model.mrr)}${delta(b.model.mrr, base?.model.mrr)} |`,
    );
    lines.push(
      `| 인기순 | ${pct(b.popularity.hitAt['2'])} | ${pct(b.popularity.hitAt['5'])} | ${pct(b.popularity.hitAt['10'])} | ${num(b.popularity.mrr)} |`,
    );
    lines.push(
      `| 무작위 기대값 | ${pct(b.random.hitAt['2'])} | ${pct(b.random.hitAt['5'])} | ${pct(b.random.hitAt['10'])} | ${num(b.random.mrr)} |`,
    );
  }

  lines.push('');
  lines.push('### 편성분 지표');
  lines.push('');
  lines.push(
    '| 대상 | 계산 수 | 고갈률 | 주제 다양성 | 편성분 내 거리 | 신규(14일) | 미노출 | 커버리지 | 사용자 간 겹침 |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|');

  const row = (label: string, m: ListMetrics, base: ListMetrics | null) =>
    `| ${label} | ${m.plans} | ${pct(m.exhaustionRate)}${delta(m.exhaustionRate, base?.exhaustionRate)} | ${num(m.topicDiversity)} | ${num(m.intraListDistance)}${delta(m.intraListDistance, base?.intraListDistance)} | ${pct(m.freshShare)} | ${pct(m.zeroExposureShare)} | ${pct(m.catalogCoverage)}${delta(m.catalogCoverage, base?.catalogCoverage)} | ${num(m.userOverlap)} |`;

  if (report.lists !== null) {
    lines.push(
      row('실사용자(오늘 배치)', report.lists, baseline?.lists ?? null),
    );
  }

  lines.push(
    row(
      `페르소나 ${report.options.simulationDays}일`,
      report.simulation,
      baseline?.simulation ?? null,
    ),
  );

  lines.push('');
  lines.push('### 페르소나');
  lines.push('');
  lines.push(
    '| 페르소나 | 편성 | 좋아하는 주제 비율 | 고갈된 날 | 자동 슬롯 | 검사 |',
  );
  lines.push('|---|---|---|---|---|---|');

  for (const persona of report.personas) {
    if (persona.skipped !== null) {
      lines.push(`| ${persona.name} | 건너뜀 — ${persona.skipped} | | | | |`);
      continue;
    }

    const before = baseline?.personas.find((p) => p.name === persona.name);
    const failed = persona.checks.filter(
      (check) => !check.passed && check.severity !== 'soft',
    ).length;
    const soft = persona.checks.filter(
      (check) => !check.passed && check.severity === 'soft',
    ).length;
    const checks =
      persona.checks.length === 0
        ? '–'
        : `${persona.checks.length - failed - soft}/${persona.checks.length}` +
          (failed > 0 ? ` **${failed}건 실패**` : '') +
          (soft > 0 ? ` (soft ${soft})` : '');

    lines.push(
      `| ${persona.name} | ${persona.picks}편 | ${persona.likedTopicShare === null ? '–' : pct(persona.likedTopicShare)}${delta(persona.likedTopicShare, before?.likedTopicShare)} | ${persona.exhaustedOnDay ?? '–'} | ${persona.autoExpandOnDay === null ? '–' : `${persona.autoExpandOnDay}일차`} | ${checks} |`,
    );
  }

  lines.push('');
  lines.push('### 불변식');
  lines.push('');

  for (const invariant of report.invariants) {
    lines.push(
      `- ${invariant.passed ? '통과' : '**위반**'} — ${invariant.name}${invariant.passed ? '' : ` (${invariant.detail})`}`,
    );
  }

  if (verdict.failures.length > 0) {
    lines.push('');
    lines.push('### 실패 사유');
    lines.push('');
    verdict.failures.forEach((failure) => lines.push(`- ${failure}`));
  }

  if (verdict.warnings.length > 0) {
    lines.push('');
    lines.push('### 참고');
    lines.push('');
    verdict.warnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  return lines.join('\n');
}
