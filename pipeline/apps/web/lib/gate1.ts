/**
 * 글로벌판 게이트 1 승인 조건 (글로벌 명세 6.3, 2026-10-15 KAN-209) — **en 인스턴스만** 부른다. 한국판 승인은 종전 그대로다.
 *   1. 배제 주제가 아니다 — 기획 입력 때의 판정(gate1_checks.screen)이 있고 통과
 *   2. 빈 역할·소스 겹침 경고가 있으면 사람이 확인했다는 기록(gate1_checks.warnings_confirmed)
 * 도메인 계층은 보지 않는다(2026-10-17 박수헌 — 한국판과 같게). 판정 대기 도메인은 참고로 목록만 돌려준다.
 * 사람이 차단한 도메인의 소스는 초안 설계가 쓰지 않는다(워커 blockedTierHosts).
 * 승인 버튼(표시)과 승인 액션(서버 재검사)이 같은 함수를 쓴다.
 */
export interface Gate1Domain { id: string; domain: string; tier: string }
export interface Gate1Row { sources: unknown; gaps: string[] | null; dedup_note: string | null; gate1_checks: { screen?: { excluded?: boolean; reason?: string }; warnings_confirmed?: { at: string; by: string } } | null }
export interface Gate1Result { ok: boolean; blockers: string[]; pendingDomains: { id: string | null; domain: string }[]; needsWarningConfirm: boolean }

/** URL 에 맞는 도메인 행 — 호스트(www 무시) 또는 경로가 붙은 공유 호스트 행 중 가장 긴 것 (워커 findDomainForUrl 과 같은 규칙) */
export function domainForUrl(url: string, domains: Gate1Domain[]): Gate1Domain | null {
  let u: URL; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  const path = `${host}${u.pathname}`;
  let best: Gate1Domain | null = null;
  for (const d of domains) {
    const k = d.domain.replace(/^www\./, "").replace(/\/+$/, "");
    const hit = k.includes("/") ? path === k || path.startsWith(`${k}/`) : host === k;
    if (hit && (!best || k.length > best.domain.length)) best = d;
  }
  return best;
}

export const hasOverlapWarning = (dedupNote: string | null) => !!dedupNote?.includes("⚠️ 소스 겹침");

export function gate1Check(row: Gate1Row, domains: Gate1Domain[]): Gate1Result {
  const sources = (Array.isArray(row.sources) ? row.sources : []) as { url?: string }[];
  const blockers: string[] = [];
  const pending = new Map<string, { id: string | null; domain: string }>();
  for (const s of sources) {
    if (!s.url) continue;
    const d = domainForUrl(s.url, domains);
    let host = s.url; try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* 그대로 */ }
    if (!d || d.tier === "candidate") pending.set(d?.domain ?? host, { id: d?.id ?? null, domain: d?.domain ?? host });
  }
  const screen = row.gate1_checks?.screen;
  if (!screen) blockers.push("배제 주제 판정 기록 없음 — 주제 기획 화면으로 다시 입력");
  else if (screen.excluded !== false) blockers.push(`배제 주제: ${screen.reason ?? "사유 없음"}`);
  const needsWarningConfirm = (row.gaps?.length ?? 0) > 0 || hasOverlapWarning(row.dedup_note);
  if (needsWarningConfirm && !row.gate1_checks?.warnings_confirmed) blockers.push("빈 역할·소스 겹침 경고 확인 필요");
  return { ok: blockers.length === 0, blockers, pendingDomains: [...pending.values()], needsWarningConfirm };
}
