import { executedBy } from "../config.js";
import { insertRun, latestSourceUrl, listDomainsForCheck, saveDomainEvidence, setJobProgress, type CheckDomain, type Job } from "../db.js";
import { log, sleep, stripHtml } from "../util.js";

/**
 * 소스 풀 확인 항목 ①~④ 자동 수집 (spec/01 4.1 · 웹 decide-form의 CHECK 목록).
 * AI 없음 — HTTP만: robots.txt · 홈 · 약관/저작권/소개 페이지(≤4) · 표본 기사 1건. 403 등 차단은 우회하지 않고 기록만 한다.
 * 결과는 domains.evidence 에 저장하고 판정은 사람이 한다. suggestion 은 참고용 기계 제안일 뿐 절대 자동 적용하지 않는다.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const AI_BOTS = ["GPTBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "CCBot", "Google-Extended", "Bytespider", "PerplexityBot", "Applebot-Extended", "cohere-ai", "meta-externalagent", "Amazonbot"];

type Status = "ok" | "warn" | "bad" | "unknown";
interface Snip { url: string; text: string }
interface Item { status: Status; summary: string; snippets: Snip[] }
interface Evidence {
  checked_at: string; checked_by: string; http: Record<string, number | string>; pages: string[];
  items: { license: Item; publisher: Item; terms: Item; access: Item };
  suggestion: "allow_open" | "allow_support" | "hold" | "blocked" | null; suggestion_reason: string;
  /** 시드 파일·스윕에서 사람이 남긴 기존 단서(domains.note)의 제안 — 기계 제안과 다르면 UI가 표시 */
  prior_suggestion?: "allow_open" | "allow_support" | "hold" | "blocked" | null;
}
type Page = { ok: true; status: number; text: string; url: string } | { ok: false; status: number | string; text: ""; url: string; error: string };

async function get(url: string, accept = "text/html,*/*"): Promise<Page> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "ko,en;q=0.8" }, redirect: "follow", signal: ctrl.signal });
    const text = (await res.text()).slice(0, 600_000);
    return { ok: res.ok, status: res.status, text: res.ok ? text : "", url: res.url || url, ...(res.ok ? {} : { error: `HTTP ${res.status}` }) } as Page;
  } catch (e: any) {
    return { ok: false, status: "error", text: "", url, error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e) };
  } finally { clearTimeout(t); }
}

const item = (status: Status, summary: string, snippets: Snip[] = []): Item => ({ status, summary, snippets });
function snip(text: string, idx: number, url: string, radius = 110): Snip {
  const s = Math.max(0, idx - radius), e = Math.min(text.length, idx + radius);
  return { url, text: (s > 0 ? "…" : "") + text.slice(s, e).replace(/\s+/g, " ").trim() + (e < text.length ? "…" : "") };
}
function find(text: string, re: RegExp, url: string, max = 2): Snip[] {
  const out: Snip[] = []; const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"); let m: RegExpExecArray | null;
  while ((m = g.exec(text)) && out.length < max) { out.push(snip(text, m.index, url)); if (m[0].length === 0) g.lastIndex++; }
  return out;
}

/** robots.txt → { allDisallowed, aiBlocked[] } */
function parseRobots(txt: string) {
  const groups: { agents: string[]; disallow: string[] }[] = []; let cur: { agents: string[]; disallow: string[] } | null = null; let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim(); if (!line) continue;
    const [k, ...rest] = line.split(":"); const v = rest.join(":").trim(); const key = k.trim().toLowerCase();
    if (key === "user-agent") { if (!cur || !lastWasAgent) { cur = { agents: [], disallow: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; }
    else { lastWasAgent = false; if (cur && key === "disallow") cur.disallow.push(v); }
  }
  const blocksAll = (g: { disallow: string[] }) => g.disallow.some((d) => d === "/" || d === "/*");
  const allDisallowed = groups.some((g) => g.agents.includes("*") && blocksAll(g));
  const aiBlocked = AI_BOTS.filter((b) => groups.some((g) => g.agents.includes(b.toLowerCase()) && blocksAll(g)));
  return { allDisallowed, aiBlocked };
}

const LICENSE_RE = /공공누리|KOGL|kogl\.or\.kr|creativecommons\.org|Creative Commons|\bCC[ -]?BY(?:[ -][A-Z]{2})*(?:\s*\d\.\d)?|\bCC0\b|Open Access|오픈\s*액세스/i;
const RESTRICT_RE = /All rights reserved|무단\s*(전재|복제|배포|전송)[^.]{0,20}금지|저작권법[^.]{0,30}(보호|처벌)/i;
const PAYWALL_RE = /isAccessibleForFree"?\s*:\s*false|구독자\s*전용|구독하시면|로그인\s*(후|하시면)[^.]{0,20}(이용|열람)|Subscribe to (read|continue)|paywall|for subscribers only|members[- ]only/i;
const AI_TERMS_RE = /AI\s*학습|인공지능\s*학습|기계\s*학습|머신\s*러닝|자동(화된)?\s*수집|크롤(링|러)|스크래핑|text and data mining|\bTDM\b|machine[- ]learning|train(ing)?\s+(of\s+)?(an?\s+)?(AI|artificial intelligence|models?|LLMs?)|large language models?|\bLLMs?\b|scrap(e|ing|ers?)\b|crawl(ers?|ing)?\b|automated (access|means|tools|systems|queries)|generative AI|데이터\s*마이닝/i;
const PROHIBIT_RE = /금지|허용되지\s*않|불허|prohibit|not (be )?permitted|may not|must not|shall not|without (our |the )?(prior |express )?(written )?(consent|permission)/i;
const GENERIC_RE = /무단\s*(전재|복제|배포|수집|이용)|reproduc(e|tion)[^.]{0,40}prohibit|without (prior )?(written )?permission/i;
/** AI 학습을 명시적으로 허용하는 문구 — 공공누리 AI유형 등. ③ 금지가 아니라 ① 라이선스 근거로 보낸다 (첫 실행에서 korean.go.kr·museum.go.kr 오탐) */
const ALLOW_RE = /(인공지능|AI)\s*학습\s*(이\s*)?가능|공공누리|공공저작물|AI\s*유형\s*:|학습한\s*인공지능\s*모델의\s*상업적\s*이용은\s*가능|인공지능\s*학습용\s*데이터의\s*재판매|may be used (to|for) (train|text and data mining)|permitted for (text and data mining|AI training)|CC[ -]?BY/i;
/** 한국 사이트 공통 보일러플레이트 — 이메일 무단수집 거부는 콘텐츠 재사용과 무관 (bok.or.kr 오탐) */
const BOILERPLATE_RE = /이메일\s*(주소)?\s*무단\s*수집\s*거부|이메일무단수집거부/;
const LINK_RE = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

function pickLinks(html: string, base: string) {
  const host = new URL(base).host.replace(/^www\./, "");
  const buckets: Record<"terms" | "license" | "about", string[]> = { terms: [], license: [], about: [] };
  let m: RegExpExecArray | null; const seen = new Set<string>();
  while ((m = LINK_RE.exec(html))) {
    const href = m[1], text = stripHtml(m[2], 60); let u: URL;
    try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.host.replace(/^www\./, "") !== host) continue;
    const key = u.origin + u.pathname; if (seen.has(key)) continue;
    const probe = `${u.pathname} ${text}`;
    if (/이용약관|약관|terms|legal|policy|privacy|정책/i.test(probe)) buckets.terms.push(u.href);
    else if (/저작권|copyright|licen[cs]e|라이선스|라이센스|공공누리|open\s*access/i.test(probe)) buckets.license.push(u.href);
    else if (/^\/(about|company|intro)|소개|회사소개|about\s*us|who we are/i.test(probe)) buckets.about.push(u.href);
    else continue;
    seen.add(key);
  }
  return [...buckets.terms.slice(0, 2), ...buckets.license.slice(0, 1), ...buckets.about.slice(0, 1)];
}

function publisherGuess(host: string, homeText: string, homeHtml: string, publisher: string, url: string): Item {
  const h = host.toLowerCase(); const sn: Snip[] = [];
  const site = (homeHtml.match(/property=["']og:site_name["'][^>]*content=["']([^"']+)/i) ?? [])[1];
  if (site) sn.push({ url, text: `og:site_name = ${site}` });
  if (/\.(go\.kr|gov|gov\.uk|gc\.ca|gov\.au|europa\.eu)$/.test(h) || /\.go\.kr\//.test(h)) return item("ok", "공공기관 도메인 — 1군 요건(공공 발행물)에 해당", sn);
  if (/\.(ac\.kr|edu|ac\.uk|edu\.au)$/.test(h)) return item("ok", "학술기관 도메인", sn);
  if (/medium\.com|substack\.com|tistory\.com|velog\.io|brunch\.co\.kr|blogspot\.|wordpress\.com|github\.io|note\.com|naver\.com\/|blog\.naver/.test(h)) return item("warn", "개인·플랫폼 블로그 — 2군 후보 (약관은 플랫폼 것)", sn);
  const corp = find(homeText, /주식회사|\(주\)|㈜|\bInc\.|\bLtd\.?|\bLLC\b|\bCorp\.|\bGmbH\b|\bCo\., ?Ltd/i, url, 1);
  const biz = find(homeText, /사업자\s*등록\s*번호|통신판매업\s*신고/i, url, 1);
  const inst = find(homeText, /재단법인|사단법인|협회|학회|연구원|연구소|대학교|University|Institute|Foundation|Association|Society|Museum|Library|Archive/i, url, 1);
  const media = find(homeText, /인터넷신문|신문사|등록번호\s*:?\s*[가-힣]+,?\s*아\d+|언론사|편집인|발행인|Newsroom|Editorial (team|staff|board)/i, url, 1);
  const techblog = /blog|tech|engineering|developers?|dev\.|labs?\./.test(h);
  if (corp.length && techblog) return item("ok", `기업 공식 채널 (기술·개발 블로그) — 1군 요건(기업 공식 발행물)에 해당${publisher ? ` · 발행처 ${publisher}` : ""}`, [...sn, ...corp]);
  if (media.length) return item("warn", "상업 매체(언론사) 신호 — 2군 후보, 약관 확인 필수", [...sn, ...media]);
  if (inst.length) return item("ok", "기관·학술 단체 신호 — 발행 주체 성격상 1군 후보 (라이선스 함께 확인)", [...sn, ...inst]);
  if (corp.length || biz.length) return item("warn", "기업·상업 주체 신호 — 공식 채널인지(제품·회사 블로그) 매체인지 확인", [...sn, ...corp, ...biz]);
  return item("unknown", "발행 주체 신호를 홈에서 찾지 못함 — 소개 페이지 직접 확인 필요", sn);
}

async function checkDomain(d: CheckDomain): Promise<Evidence> {
  const base = `https://${String(d.domain).replace(/\/+$/, "")}`;
  const host = new URL(base).host;
  const http: Record<string, number | string> = {}; const pages: string[] = [];
  const license: Snip[] = [], termsBad: Snip[] = [], termsGeneric: Snip[] = [], access: Snip[] = [];
  let restrict: Snip[] = [], paywall: Snip[] = [];
  let termsPagesFetched = 0, aiBotsBlocked: string[] = [], robotsAll = false;

  // ④ robots.txt
  const robots = await get(`https://${host}/robots.txt`, "text/plain,*/*");
  http.robots = robots.status;
  if (robots.ok && !/<html/i.test(robots.text)) {
    const r = parseRobots(robots.text); robotsAll = r.allDisallowed; aiBotsBlocked = r.aiBlocked;
    if (robotsAll) access.push({ url: robots.url, text: "robots.txt: User-agent: * / Disallow: / — 전체 수집 거부" });
    if (aiBotsBlocked.length) access.push({ url: robots.url, text: `robots.txt: AI 봇 차단 — ${aiBotsBlocked.join(", ")}` });
  }

  // 홈
  const home = await get(base);
  http.home = home.status;
  let homeText = "", homeHtml = "";
  if (home.ok) {
    homeHtml = home.text; homeText = stripHtml(homeHtml, 200_000); pages.push(home.url);
    license.push(...find(homeText, LICENSE_RE, home.url, 2), ...find(homeText, ALLOW_RE, home.url, 1));
    const lic = homeHtml.match(/<(?:a|link)\b[^>]*(?:rel=["']license["']|href=["'][^"']*creativecommons\.org[^"']*["'])[^>]*>/i);
    if (lic) license.push({ url: home.url, text: stripHtml(lic[0], 160) || "rel=license 링크" });
    restrict = find(homeText, RESTRICT_RE, home.url, 1);
    paywall = find(homeHtml, PAYWALL_RE, home.url, 1);
  } else {
    access.push({ url: base, text: `홈 접근 실패 — ${home.error}` });
  }

  // 약관·저작권·소개 페이지 (홈에서 링크 발견 시)
  if (home.ok) {
    for (const u of pickLinks(homeHtml, home.url)) {
      const p = await get(u); http[`page:${new URL(u).pathname}`] = p.status;
      if (!p.ok) continue;
      termsPagesFetched++; pages.push(p.url);
      const txt = stripHtml(p.text, 300_000);
      license.push(...find(txt, LICENSE_RE, p.url, 1));
      for (const s of find(txt, AI_TERMS_RE, p.url, 4)) {
        if (ALLOW_RE.test(s.text)) { license.push(s); continue; }          // 허용 문구 → ① 근거
        (PROHIBIT_RE.test(s.text) ? termsBad : termsGeneric).push(s);
      }
      termsGeneric.push(...find(txt, GENERIC_RE, p.url, 1).filter((x) => !BOILERPLATE_RE.test(x.text)));
      if (!paywall.length) paywall = find(p.text, PAYWALL_RE, p.url, 1);
      await sleep(250);
    }
  }

  // 약관 링크를 못 찾았고 서브도메인이면 상위 도메인(기업 루트)에서 한 번 더 — 기술 블로그의 약관은 대개 회사 사이트에 있다
  if (home.ok && termsPagesFetched === 0) {
    const labels = host.replace(/^www\./, "").split(".");
    const parent = labels.length >= 3 && !/^(co|or|go|ac|ne)$/.test(labels[labels.length - 2]) ? labels.slice(1).join(".") : labels.length >= 4 ? labels.slice(1).join(".") : null;
    if (parent) {
      const ph = await get(`https://${parent}`); http[`parent:${parent}`] = ph.status;
      if (ph.ok) {
        const links = pickLinks(ph.text, ph.url).filter((u) => /약관|terms|legal|policy|저작권|copyright|licen/i.test(u));
        for (const u of links.slice(0, 2)) {
          const p = await get(u); http[`page:${new URL(u).host}${new URL(u).pathname}`] = p.status;
          if (!p.ok) continue;
          termsPagesFetched++; pages.push(p.url);
          const txt = stripHtml(p.text, 300_000);
          license.push(...find(txt, LICENSE_RE, p.url, 1));
          for (const s of find(txt, AI_TERMS_RE, p.url, 4)) { if (ALLOW_RE.test(s.text)) { license.push(s); continue; } (PROHIBIT_RE.test(s.text) ? termsBad : termsGeneric).push(s); }
          termsGeneric.push(...find(txt, GENERIC_RE, p.url, 1).filter((x) => !BOILERPLATE_RE.test(x.text)));
          await sleep(250);
        }
        if (termsPagesFetched) pages.push(`(약관은 상위 도메인 ${parent}에서 확인)`);
      }
    }
  }

  // 표본 기사 (스윕된 것 중 최근 1건)
  const art = await latestSourceUrl(d.id);
  if (art) {
    const p = await get(art); http.article = p.status;
    if (!p.ok) access.push({ url: art, text: `표본 기사 접근 실패 — ${p.error}` });
    else if (!paywall.length) paywall = find(p.text, PAYWALL_RE, p.url, 1);
  }
  // 스윕 기록의 차단 신호
  if (d.note && /403|Human Verification|봇 검증|bot verification/i.test(d.note)) access.push({ url: base, text: `스윕 기록: ${d.note.split(" | ").find((x) => /403|Verification|봇/i.test(x)) ?? "차단 신호"}` });

  // ── 기존 단서(domains.note — 시드 파일에서 백필한 사람 관찰) 반영. 자동 확인이 못 본 것을 보태되, "예상"은 상태를 올리지 않는다 ──
  const note = d.note ?? ""; const clue = (re: RegExp) => { const m = note.match(re); return m ? { url: base, text: `기존 단서: ${note.slice(Math.max(0, m.index! - 60), m.index! + 90).replace(/\s+/g, " ")}` } : null; };
  const noteLic = clue(/공공누리|KOGL|CC[ -]?BY[^ ,.]*|\bCC0\b|오픈\s*액세스|Open Access|퍼블릭\s*도메인|public domain/i);
  const noteMedia = clue(/상업\s*매체|언론사|개인\s*블로그/);
  const notePaywall = clue(/페이월|paywall|로그인\s*뒤|구독\s*전용/i);
  const pm = note.match(/제안\s*:?\s*(allow_open|allow_support|hold|blocked)|제안 계층\s*:\s*(1군|2군)|(blocked|hold)\s*검토/i);
  const priorSuggestion = pm ? ((pm[1] ?? (pm[2] === "1군" ? "allow_open" : pm[2] === "2군" ? "allow_support" : pm[3]?.toLowerCase())) as Evidence["prior_suggestion"]) : null;

  // ── 항목별 판정 ──
  const licItem: Item = license.length
    ? item("ok", `허용 라이선스 표기 발견${license.some((x) => /(인공지능|AI)\s*학습\s*(이\s*)?가능|AI\s*유형/.test(x.text)) ? " · AI 학습 허용 명시(공공누리 AI유형)" : ""} — 1군 요건 충족 가능 (문구 확인)`, license.slice(0, 3))
    : restrict.length ? item("warn", "허용 라이선스 없음 · 저작권 유보 문구 있음 (All rights reserved 류) — 2군 이하", restrict)
    : home.ok ? item("unknown", noteLic ? "자동 확인으로는 표기를 못 찾음 · 기존 단서에 라이선스 언급 있음 — 그 페이지를 직접 확인" : "홈·약관에서 라이선스 표기를 찾지 못함 — 푸터·소개 페이지 직접 확인", noteLic ? [noteLic] : []) : item("unknown", "홈 접근 실패로 확인 불가", noteLic ? [noteLic] : []);
  if (noteLic && licItem.status === "ok") licItem.snippets.push(noteLic);
  let pubItem: Item = home.ok ? publisherGuess(host, homeText, homeHtml, d.publisher, home.url) : item("unknown", "홈 접근 실패로 확인 불가");
  if (noteMedia && pubItem.status !== "warn") pubItem = item("warn", `${pubItem.status === "ok" ? "자동 확인은 기관·기업 신호를 봤으나 " : ""}기존 단서가 상업 매체·개인으로 분류 — 2군 후보로 보고 약관 확인`, [...pubItem.snippets, noteMedia]);
  const termsItem: Item = termsBad.length
    ? item("bad", `AI 학습·자동수집 금지 조항 발견 (${termsBad.length}건) — 차단 요건`, termsBad.slice(0, 3))
    : aiBotsBlocked.length
      ? item("warn", `약관 명문 조항은 없으나 robots.txt가 AI 봇을 차단 — 재사용 거부 의사로 볼 소지 (${aiBotsBlocked.join(", ")})`, access.filter((s) => /AI 봇/.test(s.text)))
      : termsGeneric.length
        ? item("warn", `AI 명시 조항 없음 · 일반 무단전재 금지 또는 크롤링 언급 있음 (${termsGeneric.length}건) — 문맥 확인`, termsGeneric.slice(0, 3))
        : termsPagesFetched ? item("ok", `약관·저작권 페이지 ${termsPagesFetched}건 확인 — AI 학습·자동수집 금지 문구 없음`) : item("unknown", "약관·저작권 페이지 링크를 홈에서 찾지 못함 — 직접 확인 필요");
  if (notePaywall) paywall.push(notePaywall);
  const artBlocked = typeof http.article === "number" && [401, 403, 429, 451].includes(http.article as number);
  const homeBlocked = typeof http.home === "number" && [401, 403, 429, 451].includes(http.home as number);
  const accItem: Item = robotsAll || artBlocked || homeBlocked || (paywall.length && /isAccessibleForFree/.test(paywall[0].text))
    ? item("bad", robotsAll ? "robots.txt 전체 수집 거부" : artBlocked || homeBlocked ? `기술적 차단 (HTTP ${artBlocked ? http.article : http.home}) — 우회 금지, 차단 요건` : "페이월 (isAccessibleForFree=false)", [...access, ...paywall].slice(0, 3))
    : paywall.length || access.length
      ? item("warn", paywall.length ? "구독·로그인 안내 문구 있음 — 페이월 여부 확인" : "접근은 되나 차단·거부 신호 있음", [...paywall, ...access].slice(0, 3))
      : home.ok ? item("ok", `홈${art ? "·표본 기사" : ""} 정상 접근 (HTTP ${http.home}${art ? `/${http.article}` : ""}) · robots 거부 없음`) : item("unknown", `홈 접근 실패 — ${(home as any).error}`);

  // ── 기계 제안 (참고용) ──
  let suggestion: Evidence["suggestion"] = null, reason = "";
  if (accItem.status === "bad" || termsItem.status === "bad") { suggestion = "blocked"; reason = accItem.status === "bad" ? accItem.summary : termsItem.summary; }
  else if (accItem.status === "warn") { suggestion = "hold"; reason = `접근 주의 — ${accItem.summary} (페이월·AI 봇 차단이면 1군 불가)`; }
  else if (licItem.status === "ok") { suggestion = "allow_open"; reason = "허용 라이선스 표기"; }
  else if (pubItem.status === "ok") { suggestion = "allow_open"; reason = `${pubItem.summary.split(" — ")[0]}${termsItem.status === "unknown" ? " · 약관은 못 찾음(공식 채널이라 1군 요건은 발행 주체로 충족 — 약관 링크만 확인)" : " · 약관 금지 조항 없음"}`; }
  else if (pubItem.status === "warn" && termsItem.status === "ok") { suggestion = "allow_support"; reason = "상업·개인 주체, 약관 금지 조항 없음, 접근 정상"; }
  else { suggestion = "hold"; reason = "①~④ 중 미확인 또는 주의 항목이 남음"; }

  if (priorSuggestion && priorSuggestion !== suggestion) reason += ` · 기존 단서의 제안(${priorSuggestion})과 다름 — 근거를 대조해 판정`;
  return { checked_at: new Date().toISOString(), checked_by: executedBy, http, pages, items: { license: licItem, publisher: pubItem, terms: termsItem, access: accItem }, suggestion, suggestion_reason: reason, prior_suggestion: priorSuggestion };
}

export async function runDomainCheck(job: Job) {
  const ids = Array.isArray(job.payload.domain_ids) ? (job.payload.domain_ids as string[]) : job.payload.domain_id ? [String(job.payload.domain_id)] : null;
  const onlyUnchecked = job.payload.only_unchecked !== false;
  const domains = await listDomainsForCheck(ids, onlyUnchecked);
  if (!domains.length) return { checked: 0, note: "대상 없음" };
  const t0 = Date.now(); const sug: Record<string, number> = {}; const failed: string[] = [];
  for (let i = 0; i < domains.length; i++) {
    const d = domains[i];
    await setJobProgress(job.id, { phase: "소스 풀 확인 (①~④ 자동 수집)", detail: `${i + 1}/${domains.length} ${d.domain}`, elapsedMs: Date.now() - t0, turns: i + 1 });
    try {
      const ev = await checkDomain(d);
      await saveDomainEvidence(d.id, ev);
      sug[ev.suggestion ?? "none"] = (sug[ev.suggestion ?? "none"] ?? 0) + 1;
      log(`  ✓ ${d.domain} — ①${ev.items.license.status} ②${ev.items.publisher.status} ③${ev.items.terms.status} ④${ev.items.access.status} → 제안 ${ev.suggestion}`);
    } catch (e: any) {
      failed.push(`${d.domain}: ${e?.message ?? e}`); log(`  ✖ ${d.domain} 확인 실패: ${e?.message ?? e}`);
    }
    await sleep(300);
  }
  const summary = `도메인 ${domains.length}곳 확인 (실패 ${failed.length}) · 제안 분포: ${Object.entries(sug).map(([k, v]) => `${k} ${v}`).join(" / ")}`;
  await insertRun({ phase: "domain_check", result: `${summary}${failed.length ? ` · 실패: ${failed.join("; ").slice(0, 600)}` : ""}`, prompt_version: "domain-check-v1 (HTTP 휴리스틱, AI 없음)", executed_by: executedBy });
  return { checked: domains.length, failed, suggestions: sug, elapsed_ms: Date.now() - t0 };
}
