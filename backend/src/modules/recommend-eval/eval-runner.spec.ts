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

  it('합성 카탈로그는 페르소나 7종을 전부 돌릴 재료를 갖는다', () => {
    expect(report.personas.map((persona) => persona.skipped)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(report.personas.every((persona) => persona.days === 5)).toBe(true);
  });

  it('관심 밖 주제를 반복 완청한 페르소나에게 첫날 자동 슬롯이 붙는다', () => {
    const outside = report.personas.find((p) => p.name === 'outside-listener');
    expect(outside?.autoExpandOnDay).toBe(1);
  });

  it('지표가 리포트에 남는다 — 커버리지·다양성·고갈률', () => {
    expect(report.simulation.plans).toBe(7 * 5);
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
