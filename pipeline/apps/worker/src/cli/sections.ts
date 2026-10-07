import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config.js";
import { pool } from "../db.js";
import { putFile, storage } from "../storage.js";
import { parseScriptForTts } from "../tts/script.js";
import { buildSections } from "../tts/sections.js";
import { attachSummaries, SUMMARY_CACHE_FILE } from "../tts/section-summary.js";
import type { ScriptSegment } from "../tts/segments.js";

/**
 * 구간 제목 소급 (2026-10-06 KAN-137) — TTS 를 다시 하지 않고, S3 의 대본(script.md)과 자막 세그먼트(script-segments.json)로 script-sections.json 을 만든다.
 *   npm run tts:sections -w apps/worker [-- --apply] [-- --ids T1,T2]
 * 대상: 오디오가 있는 편 중 자막 세그먼트가 있는 편(--ids 로 좁힌다). 구간 시각은 그 세그먼트(= 파이프라인 S3 의 현재 배포본) 기준이다 —
 *   앱에 나가 있는 오디오가 그보다 옛것이면(2026-10-06 재합성 뒤 재발행 전) 그 오디오와는 맞지 않으니, 재발행 때 새 오디오·자막과 함께 실린다.
 * 기본은 점검(만들기만 하고 올리지 않는다). --apply 면 episodes/<id>/script-sections.json 을 올린다 — 못 만든 편은 [] 로 덮어 옛 구간을 남기지 않는다.
 */
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const noSummary = args.includes("--no-summary"); // 구역(kind)만 — 요약 호출 없이
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : undefined);
const onlyIds = opt("ids")?.split(",").map((s) => s.trim()).filter(Boolean);

const rows = (await pool.query<{ id: string; script_key: string | null }>(
  `select id, script_key from public.episodes where audio_dist_key is not null ${onlyIds ? "and id = any($1)" : ""} order by id`,
  onlyIds ? [onlyIds] : [],
)).rows;

let made = 0, empty = 0, skipped = 0, cost = 0;
for (const r of rows) {
  const rel = `episodes/${r.id}`;
  const segText = await storage().get(`${rel}/script-segments.json`).then((b) => b.toString("utf8")).catch(() => null);
  if (!segText || !r.script_key) { skipped++; continue; } // 자막이 없는 편(KAN-72 이전·정렬 실패)은 구간도 없다
  const md = (await storage().get(r.script_key.replace(/^(s3|local):/, ""))).toString("utf8");
  const built = buildSections(parseScriptForTts(md).turns, JSON.parse(segText) as ScriptSegment[]);
  if (built.sections.length) made++; else empty++;
  // 구역·요약 (KAN-152) — 요약 캐시는 S3 에서 받아 쓰고 다시 올린다(다음 합성이 같은 대사면 다시 부르지 않게). --no-summary 면 구역만
  let sections = built.sections, sumNote = "";
  if (built.sections.length && !noSummary) {
    const dir = path.join(cfg.workRoot, rel); await fs.mkdir(dir, { recursive: true });
    const cached = await storage().get(`${rel}/${SUMMARY_CACHE_FILE}`).catch(() => null);
    if (cached) await fs.writeFile(path.join(dir, SUMMARY_CACHE_FILE), cached); else await fs.rm(path.join(dir, SUMMARY_CACHE_FILE), { force: true });
    const title = (await pool.query<{ title: string }>("select b.title from public.episodes e join public.backlog b on b.id = e.backlog_id where e.id = $1", [r.id])).rows[0]?.title ?? r.id;
    const sum = await attachSummaries(dir, title, built.sections, built.texts);
    sections = sum.sections; sumNote = sum.note; cost += sum.costUsd;
    if (apply && sections.some((s) => s.summary)) await putFile(`${rel}/${SUMMARY_CACHE_FILE}`, await fs.readFile(path.join(dir, SUMMARY_CACHE_FILE), "utf8"));
  }
  console.log(`${r.id} ${sections.length ? `구간 ${sections.length}개${built.missingTurns ? ` [자막에서 빠진 턴 ${built.missingTurns.join("·")}]` : ""}${sumNote}\n   ${sections.map((s) => `${s.start_sec.toFixed(1)} ${s.kind ?? "?"} ${s.summary ?? `(${s.title})`}`).join(" | ").slice(0, 240)}` : `구간 없음(${built.reason})`}`);
  if (apply) await putFile(`${rel}/script-sections.json`, JSON.stringify(sections, null, 1));
}
console.log(`\n대상 ${rows.length}편 · 구간 ${made}편 · 구간 없음 ${empty}편 · 자막 없어 건너뜀 ${skipped}편 · 요약 비용 $${cost.toFixed(3)}${apply ? " · S3 반영" : " · 점검만(--apply 로 올린다)"}`);
await pool.end();
