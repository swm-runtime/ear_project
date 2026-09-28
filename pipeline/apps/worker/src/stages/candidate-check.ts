import { SOURCE_ROLES } from "@ear/pipeline";

/**
 * 후보 성립 판정 (spec/03 3장 다양성 기준) — 보강 재판정(reinforce.ts)과 주제 기획(topic-seed.ts)이 같은 규칙을 쓴다 (2026-09-26 분리, 동작 변경 없음).
 * 소스 3건 · 발행처 3곳 · 한 발행처 50% 이하 · 근거 앵커 1건 · 역할 3종. 모델의 verdict 와 무관하게 코드가 다시 센다.
 */
export interface CheckedSource { publisher: string; domain: string; roles: string[] }
export function checkCandidateSources(srcs: CheckedSource[]) {
  const pubs = new Map<string, number>();
  for (const s of srcs) pubs.set(s.publisher || s.domain, (pubs.get(s.publisher || s.domain) ?? 0) + 1);
  const maxShare = srcs.length ? Math.max(...pubs.values()) / srcs.length : 1;
  const roleSet = new Set(srcs.flatMap((s) => s.roles));
  const problems: string[] = [];
  if (srcs.length < 3) problems.push(`소스 ${srcs.length}건`);
  if (pubs.size < 3) problems.push(`발행처 ${pubs.size}곳`);
  if (maxShare > 0.5) problems.push(`한 발행처 ${Math.round(maxShare * 100)}%`);
  if (!roleSet.has("근거 앵커")) problems.push("근거 앵커 없음");
  if (roleSet.size < 3) problems.push(`역할 ${roleSet.size}종`);
  /** 반드시 있어야 하는 역할(근거 앵커·사례) 중 빈 것 — 모델이 낸 gaps 에 합친다 */
  const missingCore = SOURCE_ROLES.filter((role) => !roleSet.has(role) && (role === "근거 앵커" || role === "사례"));
  return { pubs, maxShare, roleSet, problems, missingCore, ok: problems.length === 0 };
}
