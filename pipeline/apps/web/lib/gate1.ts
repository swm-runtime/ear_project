/**
 * 글로벌판 후보의 판정 대기 도메인 — 승인 화면에 참고로 보인다(글로벌 명세 6.3). **en 인스턴스만** 부른다.
 * 게이트 1 승인 조건은 없다(2026-10-17 박수헌 — 한국판과 같게). 종전 조건(KAN-209: 도메인 전부 판정 · 뼈대 1군 · 배제 주제 판정 기록 · 경고 확인)은 뺐다.
 * 배제 주제는 기획 입력 때 거르고(topic-screen), 사람이 차단한 도메인의 소스는 초안 설계가 쓰지 않는다(워커 blockedTierHosts).
 */
export interface Gate1Domain { id: string; domain: string; tier: string }
export interface PendingDomain { id: string | null; domain: string }

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

export function pendingDomainsOf(sources: unknown, domains: Gate1Domain[]): PendingDomain[] {
  const pending = new Map<string, PendingDomain>();
  for (const s of (Array.isArray(sources) ? sources : []) as { url?: string }[]) {
    if (!s.url) continue;
    const d = domainForUrl(s.url, domains);
    let host = s.url; try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* 그대로 */ }
    if (!d || d.tier === "candidate") pending.set(d?.domain ?? host, { id: d?.id ?? null, domain: d?.domain ?? host });
  }
  return [...pending.values()];
}
