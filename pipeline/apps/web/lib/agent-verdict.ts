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

export function agentGate(verdicts: unknown): AgentGateResult {
  const a = agentBlock(verdicts);
  if (!a) return { ok: false, blockers: ["에이전트 판정이 아직 없습니다"], openFixes: [] };
  const blockers: string[] = [];
  if (a.publishable !== true) blockers.push(`에이전트 판정이 발행 불가입니다${a.publishable_reason ? ` — ${a.publishable_reason}` : ""}`);
  const openFixes = (Array.isArray(a.must_fix) ? a.must_fix : []).filter((m) => m.status !== "fixed");
  if (openFixes.length) blockers.push(`필수 수정 ${openFixes.length}건이 반영되지 않았습니다 (${openFixes.map((m) => m.turn ? `${m.id} ${m.turn}` : m.id).join(", ")})`);
  return { ok: blockers.length === 0, blockers, openFixes };
}
