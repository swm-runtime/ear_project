import { formatReport } from './eval-report';
import { runEvaluation } from './eval-runner';
import { EvalReport } from './recommend-eval.types';
import { buildSyntheticSnapshot } from './synthetic-catalog';

const NOW = new Date('2026-09-30T00:00:00.000Z');

/**
 * **CI 게이트** — PR마다 합성 카탈로그 위에서 평가를 돌려 불변식·페르소나 검사(hard)를 본다.
 * 숫자 지표는 여기서 판정하지 않는다(기준선은 실사용자 스냅샷으로 사람이 비교한다 —
 * `docs/backend/recommendation-evaluation.md` 5장). 편성 계산은 제품 코드(`DripBatchOrchestrator.planForUser`)
 * 그대로다 — 스코어링·자동 확장·시리즈 게이트를 고치면 이 스펙이 먼저 반응한다.
 */
describe('추천 평가 — 합성 카탈로그 (CI 게이트)', () => {
  let report: EvalReport;

  beforeAll(async () => {
    report = await runEvaluation(buildSyntheticSnapshot(NOW), {
      simulationDays: 5,
      autoExpandFeature: true,
      gitSha: null,
      baseline: null,
    });
  }, 60_000);

  it('불변식을 전부 지킨다', () => {
    const violated = report.invariants.filter((row) => !row.passed);
    expect(violated.map((row) => `${row.name}: ${row.detail}`)).toEqual([]);
  });

  it('페르소나 검사(hard)를 전부 통과한다 — soft 는 경고로만 남는다', () => {
    const failed = report.personas.flatMap((persona) =>
      persona.checks
        .filter((check) => !check.passed && check.severity !== 'soft')
        .map((check) => `${persona.name}: ${check.name} — ${check.detail}`),
    );
    expect(failed).toEqual([]);
    expect(report.verdict.passed).toBe(true);
  });

  it('합성 카탈로그는 페르소나 8종(GLOBAL 포함)을 전부 돌릴 재료를 갖는다', () => {
    expect(report.personas.map((persona) => persona.skipped)).toEqual(
      Array.from({ length: 8 }, () => null),
    );
    expect(report.personas.every((persona) => persona.days === 5)).toBe(true);
  });

  it('관심 밖 주제를 반복 완청한 페르소나에게 첫날 자동 슬롯이 붙는다', () => {
    const outside = report.personas.find((p) => p.name === 'outside-listener');
    expect(outside?.autoExpandOnDay).toBe(1);
  });

  it('지표가 리포트에 남는다 — 커버리지·다양성·고갈률', () => {
    expect(report.simulation.plans).toBe(8 * 5);
    expect(report.simulation.catalogCoverage).toBeGreaterThan(0);
    expect(report.simulation.intraListDistance).not.toBeNull();
    expect(report.backtest).toBeNull();
    expect(report.lists).toBeNull();
  });

  it('같은 입력이면 같은 결과다 — 기준선 비교가 성립하려면 결정적이어야 한다', async () => {
    const again = await runEvaluation(buildSyntheticSnapshot(NOW), {
      simulationDays: 5,
      autoExpandFeature: true,
      gitSha: null,
      baseline: null,
    });
    expect(again.simulation).toEqual(report.simulation);
    expect(again.personas.map((p) => p.likedTopicShare)).toEqual(
      report.personas.map((p) => p.likedTopicShare),
    );
  }, 60_000);

  it('자동 확장 스위치를 끄고 돌리면 관심 주제가 바뀌지 않고 그 검사도 통과한다', async () => {
    const off = await runEvaluation(buildSyntheticSnapshot(NOW), {
      simulationDays: 3,
      autoExpandFeature: false,
      gitSha: null,
      baseline: null,
    });
    expect(off.simulation.autoExpand.add).toBeUndefined();
    expect(off.simulation.autoExpand.replace).toBeUndefined();
    expect(off.verdict.passed).toBe(true);
  }, 60_000);
});

describe('판정 — 기준선과 옵션이 다르면 비교하지 않는다', () => {
  it('자동 확장 ON 기준선과 OFF 실행은 지표 Δ를 내지 않고 불합격이다 — 옵션 차이가 변경 효과로 읽히지 않게', async () => {
    const snapshot = buildSyntheticSnapshot(NOW);
    const base = {
      simulationDays: 3,
      gitSha: null,
    };
    const baseline = await runEvaluation(snapshot, {
      ...base,
      autoExpandFeature: true,
      baseline: null,
    });

    const report = await runEvaluation(snapshot, {
      ...base,
      autoExpandFeature: false,
      baseline,
    });

    expect(report.verdict.passed).toBe(false);
    expect(report.verdict.failures.join('\n')).toContain(
      '기준선과 평가 옵션이 달라',
    );
  });

  it('같은 옵션이면 기준선과 비교한다', async () => {
    const snapshot = buildSyntheticSnapshot(NOW);
    const options = {
      simulationDays: 3,
      gitSha: null,
      autoExpandFeature: false,
    };
    const baseline = await runEvaluation(snapshot, {
      ...options,
      baseline: null,
    });

    const report = await runEvaluation(snapshot, { ...options, baseline });

    expect(report.verdict.failures.join('\n')).not.toContain(
      '기준선과 평가 옵션이 달라',
    );
  });
});

describe('요약 — 옵션이 다른 기준선이면 Δ를 찍지 않는다', () => {
  it('자동 확장 ON 기준선과 OFF 실행의 요약에는 Δ 대신 "옵션이 달라 Δ 생략"이 나온다', async () => {
    const snapshot = buildSyntheticSnapshot(NOW);
    const baseline = await runEvaluation(snapshot, {
      simulationDays: 3,
      gitSha: null,
      autoExpandFeature: true,
      baseline: null,
    });
    const report = await runEvaluation(snapshot, {
      simulationDays: 3,
      gitSha: null,
      autoExpandFeature: false,
      baseline,
    });

    const summary = formatReport(report, baseline);

    expect(summary).toContain('옵션이 달라 Δ 생략');
    // Δ 표기(+0.000 / -0.000 꼴)가 표에 남지 않는다
    expect(summary).not.toMatch(/ \((?:=|[+-]\d)/);
  });
});

/**
 * 시리즈 유료화(KAN-290) 스위치를 켠 조건 — 무료 편수(3) 뒤 편이 프로 아닌 페르소나에게 가지 않는지(`series-paywall` 불변식)와,
 * 시리즈 순서 불변식이 잠긴 편을 "줄 수 없는 편"으로 본 편성 계산과 어긋나지 않는지 본다
 */
describe('추천 평가 — 시리즈 유료화 켬 (CI 게이트)', () => {
  let report: EvalReport;

  beforeAll(async () => {
    report = await runEvaluation(buildSyntheticSnapshot(NOW), {
      simulationDays: 7,
      autoExpandFeature: true,
      seriesPaywall: true,
      gitSha: null,
      baseline: null,
    });
  }, 60_000);

  it('불변식을 전부 지킨다 — series-paywall 포함', () => {
    const violated = report.invariants.filter((row) => !row.passed);
    expect(violated.map((row) => `${row.name}: ${row.detail}`)).toEqual([]);
    expect(report.invariants.some((row) => row.name.includes('KAN-290'))).toBe(
      true,
    );
    expect(report.options.seriesPaywall).toBe(true);
  });

  it('페르소나 검사(hard)를 전부 통과한다', () => {
    const failed = report.personas.flatMap((persona) =>
      persona.checks
        .filter((check) => !check.passed && check.severity !== 'soft')
        .map((check) => `${persona.name}: ${check.name} — ${check.detail}`),
    );
    expect(failed).toEqual([]);
  });
});
