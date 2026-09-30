import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatReport } from './eval-report';
import { DEFAULT_EVAL_OPTIONS, runEvaluation } from './eval-runner';
import {
  EVAL_SNAPSHOT_SCHEMA_VERSION,
  EvalReport,
  EvalSnapshot,
} from './recommend-eval.types';
import { buildSyntheticSnapshot } from './synthetic-catalog';

/**
 * 추천 평가 실행기 — `npm run eval:recommend -- [옵션]` (`docs/backend/recommendation-evaluation.md` 6장).
 *
 *   --snapshot <파일>   평가할 스냅샷(`GET /admin/recommend-eval/snapshot` 응답). 없으면 합성 카탈로그
 *   --baseline <파일>   비교할 이전 리포트(JSON). 없으면 지표는 판정하지 않는다
 *   --out <디렉토리>    리포트 저장 위치 (기본 eval/reports — gitignore)
 *   --days <n>          페르소나 시뮬레이션 일수 (기본 7)
 *   --no-auto-expand    자동 확장 스위치를 끈 것으로 평가
 *   --strict            판정이 실패면 종료 코드 1
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const flag = (name: string) => process.argv.includes(`--${name}`);

function gitSha(): string | null {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const dirty =
      execSync('git status --porcelain', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim() !== '';

    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const snapshotPath = arg('snapshot');
  const baselinePath = arg('baseline');
  const outDir = arg('out') ?? join('eval', 'reports');
  const snapshot: EvalSnapshot = snapshotPath
    ? (JSON.parse(readFileSync(snapshotPath, 'utf8')) as EvalSnapshot)
    : // 합성 카탈로그는 고정 시각으로 만든다 — 언제 돌려도 같은 결과여야 기준선과 비교가 된다
      buildSyntheticSnapshot(new Date('2026-09-30T00:00:00.000Z'));

  if (snapshot.schema_version !== EVAL_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `스냅샷 형식 버전 ${snapshot.schema_version} — 이 평가기는 ${EVAL_SNAPSHOT_SCHEMA_VERSION}을 읽는다`,
    );
  }

  const baseline = baselinePath
    ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as EvalReport)
    : null;
  const report = await runEvaluation(snapshot, {
    ...DEFAULT_EVAL_OPTIONS,
    simulationDays: Number(arg('days') ?? DEFAULT_EVAL_OPTIONS.simulationDays),
    autoExpandFeature: !flag('no-auto-expand'),
    gitSha: gitSha(),
    baseline,
  });

  console.log(formatReport(report, baseline));

  mkdirSync(outDir, { recursive: true });
  const file = join(
    outDir,
    `${report.generatedAt.replace(/[:.]/g, '-')}-${report.gitSha ?? 'nogit'}-${report.snapshot.environment}.json`,
  );
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\n리포트 저장: ${file}`);

  if (flag('strict') && !report.verdict.passed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
