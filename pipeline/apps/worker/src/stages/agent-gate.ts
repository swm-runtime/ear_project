/**
 * 글로벌판 에이전트 판정의 발행 조건 (글로벌 명세 6.10, 2026-10-16) — 패키지 단계가 en 인스턴스에서만 부른다.
 * 콘솔 apps/web/lib/agent-verdict.ts 의 agentGate 와 같은 규칙이다: agent 블록이 있고 · publishable 이 true 이고 · must_fix 가 전부 fixed.
 * 콘솔은 버튼·작업 등록에서 막고, 여기서는 비평 뒤 자동 연쇄처럼 콘솔을 거치지 않는 경로를 막는다.
 */
export function agentGateBlockers(verdicts: unknown): string[] {
  const a = (verdicts as { agent?: { publishable?: unknown; publishable_reason?: string; must_fix?: { id: string; turn?: string; status?: string }[] } } | null)?.agent;
  if (!a || typeof a !== "object") return ["에이전트 판정이 아직 없습니다"];
  const out: string[] = [];
  if (a.publishable !== true) out.push(`에이전트 판정이 발행 불가입니다${a.publishable_reason ? ` — ${a.publishable_reason}` : ""}`);
  const open = (Array.isArray(a.must_fix) ? a.must_fix : []).filter((m) => m.status !== "fixed");
  if (open.length) out.push(`필수 수정 ${open.length}건이 반영되지 않았습니다 (${open.map((m) => m.turn ? `${m.id} ${m.turn}` : m.id).join(", ")})`);
  return out;
}
