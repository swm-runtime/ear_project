/**
 * 작업 기록 화면의 작업 ↔ 실행 기록(runs) 잇기 (2026-10-15). 종전엔 (후보 ID · 단계 · 회차)가 같은 실행 기록만 찾아
 * 주제 기획(작업을 넣을 때 후보 ID 가 없다 — 작업 안에서 만든다)과 보강(작업 회차 1 · 실행 기록 회차 빈 값)의 비용이 비어 보였다.
 * 순서: 작업 결과에 남긴 비용(list_cost_usd — 그 작업 하나의 값) > 회차까지 같은 실행 기록 > 회차가 빈 실행 기록. 모델·토큰은 실행 기록에서
 */
export type RunInfo = { cost_usd: number | null; tokens: unknown; model: string | null };
export type JobLike = { type: string; attempt: number | null; payload?: { backlog_id?: string } | null; result?: { backlog_id?: string; list_cost_usd?: number } | null };

export const runKey = (backlogId: string | null | undefined, phase: string, attempt: number | null | undefined) => `${backlogId ?? ""}|${phase}|${attempt ?? "-"}`;
export const jobBacklogId = (j: JobLike): string | undefined => j.payload?.backlog_id ?? j.result?.backlog_id;

export function jobRun(j: JobLike, runs: Map<string, RunInfo>): RunInfo | undefined {
  const b = jobBacklogId(j);
  const run = runs.get(runKey(b, j.type, j.attempt)) ?? runs.get(runKey(b, j.type, null));
  const own = j.result?.list_cost_usd;
  return typeof own === "number" ? { cost_usd: own, tokens: run?.tokens ?? null, model: run?.model ?? null } : run;
}
