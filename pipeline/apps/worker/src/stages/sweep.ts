import fs from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { cfg, executedBy } from "../config.js";
import { appendDomainNote, enqueue, insertRun, sweepDomains, upsertSource, type Job } from "../db.js";
import { log, sleep, stripHtml } from "../util.js";
import { todayKst } from "@ear/pipeline";
import { workerRev } from "../assets.js";
import { putFile, s3Key } from "../storage.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface Item { title: string; url: string; summary: string; author: string; published: string | null }

/**
 * 모드 A 스윕 (spec/02): 풀 도메인의 피드를 도메인당 1회 요청, 메타데이터만 적재. 본문 요청 없음.
 * 원본 아카이브는 S3 `sweeps/`(180일 만료)에 올린다 — 조회는 sources 테이블이 담당 (spec/08 1장).
 * 끝나면 군집화(cluster) 작업을 자동 생성한다.
 */
export async function runSweep(job: Job) {
  const midTopic = String(job.payload.mid_topic ?? "");
  if (!midTopic) throw new Error("payload.mid_topic 필요");
  const domains = await sweepDomains(midTopic, cfg.pilotSweepCandidates);
  if (domains.length === 0) throw new Error(`중분류 '${midTopic}' 에 피드가 있는 스윕 대상 도메인이 없습니다`);

  const sweptAt = new Date().toISOString();
  const archive: { swept_at: string; mode: "A"; mid_topic: string; feeds: any[]; total_items?: number } = { swept_at: sweptAt, mode: "A", mid_topic: midTopic, feeds: [] };
  let total = 0, ok = 0;
  const failures: string[] = [];

  for (const d of domains) {
    const rec: any = { domain: d.domain, feed_url: d.feed_url, status: "", items: [] as Item[] };
    try {
      const items = await fetchFeed(d.feed_url);
      for (const it of items) {
        await upsertSource({ domain_id: d.id, url: it.url, title: it.title, summary: it.summary, author: it.author, published: it.published, swept_at: sweptAt });
      }
      rec.items = items;
      rec.status = `ok (${items.length})`;
      ok++; total += items.length;
      log(`  sweep ${d.domain}: ${items.length}건`);
    } catch (e: any) {
      rec.status = `fail: ${e.message}`;
      failures.push(`${d.domain}: ${e.message}`);
      await appendDomainNote(d.id, `스윕 실패 ${todayKst()}: ${String(e.message).slice(0, 120)}`);
      log(`  sweep ${d.domain}: 실패 — ${e.message}`);
    }
    archive.feeds.push(rec);
    await sleep(1200);
  }
  archive.total_items = total;

  // 아카이브: S3 sweeps/ 가 원본, WORK_ROOT/sweeps/ 는 사본 (키와 같은 상대 경로)
  const relArchive = `sweeps/sweep-${todayKst()}-${midTopic.replace(/[^\p{L}\p{N}]+/gu, "_")}-${job.id.slice(0, 8)}.json`;
  const json = JSON.stringify(archive, null, 1);
  const archivePath = path.join(cfg.workRoot, relArchive);
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.writeFile(archivePath, json, "utf-8");
  await putFile(relArchive, json);

  await insertRun({
    phase: "sweep",
    result: `모드 A · 중분류 ${midTopic} · 트리거: 웹/워커 작업 ${job.id.slice(0, 8)}. 성공 피드 ${ok}/${domains.length}, 적재 ${total}건${failures.length ? ` · 실패: ${failures.join("; ").slice(0, 600)}` : ""}${cfg.pilotSweepCandidates ? " · 파일럿 예외(candidate 포함)" : ""}`,
    prompt_version: "sweep-worker-v1",
    artifacts: [s3Key(relArchive)],
    executed_by: executedBy,
    worker_rev: workerRev(),
  });

  const clusterJobId = await enqueue({ type: "cluster", requires_ai: true, payload: { mid_topic: midTopic, sweep_job_id: job.id, sources_count: total }, parent_job_id: job.id });
  return { mid_topic: midTopic, feeds_ok: ok, feeds_total: domains.length, items: total, failures, archive: s3Key(relArchive), next: { cluster_job_id: clusterJobId } };
}

async function fetchFeed(url: string): Promise<Item[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, redirect: "follow", signal: ctrl.signal });
  } finally { clearTimeout(t); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`); // 403 등 차단은 우회하지 않는다 (spec/02 4장)
  const body = await res.text();
  if (/<title>\s*Human Verification/i.test(body)) throw new Error("bot verification page");
  return parseFeed(body);
}

export function parseFeed(xml: string): Item[] {
  // processEntities=false: 대형 피드(The Conversation 등)가 엔티티 확장 한도에 걸린다. 텍스트는 stripHtml 이 기본 엔티티를 푼다.
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", cdataPropName: "__cdata", textNodeName: "#text", trimValues: true, processEntities: false });
  const doc = parser.parse(xml);
  const items: Item[] = [];
  const text = (v: any): string => {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (Array.isArray(v)) return text(v[0]);
    if (typeof v === "object") return text(v.__cdata ?? v["#text"] ?? Object.values(v).find((x) => typeof x === "string"));
    return "";
  };
  const arr = (v: any) => (v == null ? [] : Array.isArray(v) ? v : [v]);

  const channel = doc?.rss?.channel ?? doc?.["rdf:RDF"];
  if (channel) {
    for (const it of arr(channel.item)) {
      const url = text(it.link).trim() || text(it.guid).trim();
      if (!url.startsWith("http")) continue;
      items.push({ title: stripHtml(text(it.title), 400), url, summary: stripHtml(text(it.description) || text(it["content:encoded"])), author: stripHtml(text(it["dc:creator"]) || text(it.author), 120), published: toIso(text(it.pubDate) || text(it["dc:date"])) });
    }
    return items;
  }
  const feed = doc?.feed;
  if (feed) {
    for (const e of arr(feed.entry)) {
      const links = arr(e.link);
      const alt = links.find((l: any) => !l?.["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      const url = (alt?.["@_href"] ?? text(alt)).trim();
      if (!url.startsWith("http")) continue;
      items.push({ title: stripHtml(text(e.title), 400), url, summary: stripHtml(text(e.summary) || text(e.content)), author: stripHtml(text(e.author?.name) || text(e.author), 120), published: toIso(text(e.published) || text(e.updated)) });
    }
  }
  return items;
}

function toIso(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
