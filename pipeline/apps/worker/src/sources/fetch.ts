import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/**
 * 소스 본문 가져오기 (2026-09-08 비용 절감 ③ — 설계 단발화). 모델의 WebFetch 대신 코드가 본문을 가져와 문단 단위로 번호를 붙인다.
 * - 403·429·robots 차단은 우회하지 않는다 (불변 원칙 2) — 그 소스는 제외하고 사유를 남긴다. 재시도 없음.
 * - 본문 추출: Readability 결과와 <article|main> 블록 추출 중 큰 쪽. Readability 가 다단 페이지(예: thoughtworks)에서 첫 구획만 잡는 사례 실측.
 * - 문단 ID `S{n}-{NN}` 은 설계 모델이 발췌를 "고르는" 단위다 — 발췌 본문은 모델이 쓰지 않고 코드가 원문 그대로 옮긴다(환각 없는 인용, 출력 토큰 절감).
 */
export interface FetchedSource {
  n: number; url: string; ok: boolean; status: number | string; title: string | null; byline: string | null;
  blocks: { id: string; text: string }[]; chars: number; note: string | null;
}

const UA = "Mozilla/5.0 (compatible; ear-pipeline/1.0; +https://earcast.co.kr)";
const SKIP = new Set(["NAV", "HEADER", "FOOTER", "ASIDE", "SCRIPT", "STYLE", "FORM", "NOSCRIPT", "FIGCAPTION", "BUTTON", "SVG"]);
const MAX_CHARS_PER_SOURCE = 30_000;
const MAX_BLOCK = 600;

function blocksOf(root: any): string[] {
  const out: string[] = []; const seen = new Set<string>();
  for (const e of root.querySelectorAll("p, li, h1, h2, h3, h4, blockquote, pre, td")) {
    let skip = false;
    for (let a = e.parentElement; a; a = a.parentElement) if (SKIP.has(String(a.tagName).toUpperCase())) { skip = true; break; }
    if (skip) continue;
    if (String(e.tagName).toUpperCase() === "LI" && e.querySelector("p")) continue;
    const t = String(e.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t.length < 30 || seen.has(t)) continue;
    seen.add(t); out.push(t);
  }
  return out;
}

/** 긴 문단은 문장 경계에서 ~MAX_BLOCK 자로 나눈다 — 발췌 단위가 너무 크면 모델이 고르기 어렵고 대본이 통째로 옮기기 쉽다 */
function splitLong(t: string): string[] {
  if (t.length <= MAX_BLOCK) return [t];
  const sents = t.match(/[^.!?。]+[.!?。]+["')\]]?\s*|[^.!?。]+$/g) ?? [t];
  const out: string[] = []; let cur = "";
  for (const s of sents) { if (cur && cur.length + s.length > MAX_BLOCK) { out.push(cur.trim()); cur = ""; } cur += s; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function robotsAllows(url: URL): Promise<boolean> {
  try {
    const res = await fetch(`${url.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return true;
    const txt = await res.text();
    let applies = false; const dis: string[] = [];
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
      const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
      const k = m[1].toLowerCase(), v = m[2].trim();
      if (k === "user-agent") applies = v === "*" || v.toLowerCase().includes("ear-pipeline");
      else if (k === "disallow" && applies && v) dis.push(v);
    }
    return !dis.some((d) => url.pathname.startsWith(d.replace(/\*.*$/, "")));
  } catch { return true; }
}

export async function fetchArticle(n: number, url: string): Promise<FetchedSource> {
  const base = { n, url, title: null as string | null, byline: null as string | null, blocks: [] as { id: string; text: string }[], chars: 0, note: null as string | null };
  let u: URL;
  try { u = new URL(url); } catch { return { ...base, ok: false, status: "bad-url" }; }
  if (!(await robotsAllows(u))) return { ...base, ok: false, status: "robots", note: "robots.txt 가 경로를 막음 — 우회하지 않음" };
  let res: Response;
  try { res = await fetch(u, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(25_000) }); }
  catch (e) { return { ...base, ok: false, status: "network", note: String((e as Error).message ?? e).slice(0, 120) }; }
  if (!res.ok) return { ...base, ok: false, status: res.status, note: res.status === 403 || res.status === 429 ? "접근 차단 — 우회하지 않음" : `HTTP ${res.status}` };
  const ct = res.headers.get("content-type") ?? "";
  if (!/html|xml/.test(ct)) return { ...base, ok: false, status: res.status, note: `HTML 아님 (${ct.slice(0, 40)})` };
  const html = await res.text();
  const { document } = parseHTML(html);
  let art: { title?: string | null; byline?: string | null; content?: string | null } | null = null;
  try { art = new Readability(document as any, { charThreshold: 200 }).parse(); } catch { art = null; }
  const rb = art?.content ? blocksOf(parseHTML(`<html><body>${art.content}</body></html>`).document) : [];
  const main = document.querySelector("article, main, [role=main]");
  const mb = main ? blocksOf(main) : [];
  const len = (b: string[]) => b.reduce((a, x) => a + x.length, 0);
  let chosen = len(mb) > len(rb) * 1.5 ? mb : rb;
  let note: string | null = chosen === mb && rb.length ? "본문 추출: article/main 블록 (Readability 가 일부만 잡음)" : null;
  if (!chosen.length) return { ...base, ok: false, status: res.status, note: "본문을 추출하지 못함" };
  const blocks: { id: string; text: string }[] = []; let total = 0; let truncated = false;
  for (const b of chosen) for (const piece of splitLong(b)) {
    if (total + piece.length > MAX_CHARS_PER_SOURCE) { truncated = true; break; }
    blocks.push({ id: `S${n}-${String(blocks.length + 1).padStart(2, "0")}`, text: piece }); total += piece.length;
  }
  if (truncated) note = `${note ? note + " · " : ""}${MAX_CHARS_PER_SOURCE}자에서 잘림`;
  return { ...base, ok: true, status: res.status, title: art?.title ?? document.querySelector("title")?.textContent?.trim() ?? null, byline: art?.byline ?? null, blocks, chars: total, note };
}
