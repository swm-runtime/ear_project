/**
 * 글로벌판 에이전트 판정의 발행 조건 (글로벌 명세 6.10, 2026-10-16) — **en 인스턴스만** 부른다. 한국판 발행 준비는 종전 그대로다.
 * 판정은 episodes.critic_verdicts 의 `agent` 블록이다 (docs/ai/global/judge/README.md 4장). 사람이 판정 화면에서 다시 저장해도 블록은 남는다.
 *   1. agent 블록이 있다
 *   2. publishable 이 true 다 ("필수 수정을 반영하면 발행해도 된다")
 *   3. must_fix 가 전부 fixed 다
 * 발행 준비 버튼(표시)과 작업 등록 액션(서버 재검사)이 같은 함수를 쓴다.
 */
export interface AgentMustFix { id: string; turn?: string; issue?: string; status?: string }
export interface AgentBlock { publishable?: boolean; publishable_reason?: string; must_fix?: AgentMustFix[]; report_key?: string }
export interface AgentGateResult { ok: boolean; blockers: string[]; openFixes: AgentMustFix[] }

export function agentBlock(verdicts: unknown): AgentBlock | null {
  const a = (verdicts as { agent?: unknown } | null)?.agent;
  return a && typeof a === "object" ? (a as AgentBlock) : null;
}

/** 판정 점수 한 줄 (발행 대기 목록, 2026-10-25 박수헌 "AI 채점 점수도 볼 수 있게") — judge_loop 가 남긴 `agent.loop` 에서 최고판 편집자 중앙값·회차별 점수·필수 수정 수리 수를 읽는다.
 *  loop 가 없는 옛 판정(파일럿)은 agent.editor_score 류가 없으므로 null — 화면은 "판정 점수 없음"으로 둔다 */
export interface AgentScore { score: number; original: number; bestRound: number; totals: number[]; threshold: number | null; mustFix: number; fixed: number; publishable: boolean }
export function agentScore(verdicts: unknown): AgentScore | null {
  const a = agentBlock(verdicts) as (AgentBlock & { loop?: { best?: number; threshold?: number; rounds?: { t?: number; total?: number }[] } }) | null;
  const rounds = a?.loop?.rounds;
  if (!a || !Array.isArray(rounds) || rounds.length === 0) return null;
  const totals = rounds.map((r) => Number(r.total)).filter((n) => Number.isFinite(n));
  if (!totals.length) return null;
  const best = typeof a.loop?.best === "number" && a.loop.best < totals.length ? a.loop.best : totals.indexOf(Math.max(...totals));
  const mf = Array.isArray(a.must_fix) ? a.must_fix : [];
  return { score: totals[best], original: totals[0], bestRound: best, totals, threshold: typeof a.loop?.threshold === "number" ? a.loop.threshold : null, mustFix: mf.length, fixed: mf.filter((m) => m.status === "fixed").length, publishable: a.publishable === true };
}

export function agentGate(verdicts: unknown): AgentGateResult {
  const a = agentBlock(verdicts);
  if (!a) return { ok: false, blockers: ["에이전트 판정이 아직 없습니다"], openFixes: [] };
  const blockers: string[] = [];
  if (a.publishable !== true) blockers.push(`에이전트 판정이 발행 불가입니다${a.publishable_reason ? ` — ${a.publishable_reason}` : ""}`);
  const openFixes = (Array.isArray(a.must_fix) ? a.must_fix : []).filter((m) => m.status !== "fixed");
  if (openFixes.length) blockers.push(`필수 수정 ${openFixes.length}건이 반영되지 않았습니다 (${openFixes.map((m) => m.turn ? `${m.id} ${m.turn}` : m.id).join(", ")})`);
  return { ok: blockers.length === 0, blockers, openFixes };
}

/** 백로그 "QA 통과 · 판정 대기" 묶음의 판정 상태 한 칸 (글로벌, 2026-10-23 박수헌) — 미판정·판정 중·판정 실패·기준 미달·통과가 한 줄에 섞여 구분되지 않았다.
 *  latestJob 은 그 편의 가장 최근 judge_loop 작업 상태(없으면 null) */
export function judgeState(verdicts: unknown, latestJob: string | null, backlogStatus: string): { label: string; tone: "ok" | "running" | "failed" | "held" | "none" } {
  if (backlogStatus === "packaged") return { label: "발행 준비 완료", tone: "ok" };
  if (latestJob === "queued" || latestJob === "claimed" || latestJob === "running") return { label: "판정 중", tone: "running" };
  const block = agentBlock(verdicts);
  if (!block) return latestJob === "failed" ? { label: "판정 실패 — [재판정]", tone: "failed" } : { label: "판정 전", tone: "none" };
  const g = agentGate(verdicts);
  if (g.ok) return { label: "판정 통과 — 발행 준비 대기", tone: "ok" };
  const r = block.publishable_reason ?? "";
  const m = r.match(/편집자 중앙값 (\d+) < 기준 (\d+)/);
  const why = m ? `${m[1]}점 < ${m[2]}` : g.openFixes.length ? `필수 수정 ${g.openFixes.length}건 미수리` : r.slice(0, 40);
  return { label: `판정 미달 — ${why}`, tone: "held" };
}
