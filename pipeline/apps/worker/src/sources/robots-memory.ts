import { findDomainForUrl, insertCandidateDomain, markDomainFetchBlocked, recordFetchStatus, refreshDomainFetchBlock, upsertSource } from "../db.js";
import { robotsAllows } from "./fetch.js";

/**
 * robots.txt 가 막은 검색 결과를 기억한다 (2026-10-15 — 글로벌 C2: 8건 중 4건이 robots 로 빠졌는데, 처음 보는 사이트라 도메인 행이 없어
 * 기록이 남지 않았고 다음 검색이 같은 사이트를 다시 데려왔다). 소스를 robots 상태로 남기고(군집화·최근 풀 조회는 robots 소스를 뺀다),
 * 사이트 루트("/")부터 막혀 있으면 도메인째 접근 차단을 찍어 다음 검색의 제외 목록에 넣는다. 루트가 열려 있으면 경로 단위 차단이라
 * 종전 규칙(robots·blocked 소스 3건 이상이면 도메인 차단, refreshDomainFetchBlock)에 맡긴다. 우회하지 않는다 — 기록만 한다
 */
export async function rememberRobotsBlocked(u: URL, s: { url: string; title: string; summary: string; publisher: string; published: string | null }, midTopic: string, note: string, sweptAt: string): Promise<void> {
  let d = await findDomainForUrl(s.url);
  if (!d) {
    const host = u.hostname.replace(/^www\./, "");
    await insertCandidateDomain({ domain: host, publisher: s.publisher || host, topic_coverage: [midTopic], note: `${note} — robots.txt 가 막음(소스로 쓰지 않는다)` });
    d = await findDomainForUrl(s.url);
  }
  if (!d) return;
  await upsertSource({ domain_id: d.id, url: s.url, title: s.title, summary: s.summary, author: "", published: s.published, swept_at: sweptAt, origin: "search" });
  await recordFetchStatus(s.url, "robots");
  const rootOpen = await robotsAllows(new URL("/", u)).catch(() => true);
  if (!rootOpen) await markDomainFetchBlocked(d.id);
  else await refreshDomainFetchBlock([s.url]);
}
