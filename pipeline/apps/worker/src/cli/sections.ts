import { pool } from "../db.js";
import { putFile, storage } from "../storage.js";
import { parseScriptForTts } from "../tts/script.js";
import { buildSections } from "../tts/sections.js";
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
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : undefined);
const onlyIds = opt("ids")?.split(",").map((s) => s.trim()).filter(Boolean);

const rows = (await pool.query<{ id: string; script_key: string | null }>(
  `select id, script_key from public.episodes where audio_dist_key is not null ${onlyIds ? "and id = any($1)" : ""} order by id`,
  onlyIds ? [onlyIds] : [],
)).rows;

let made = 0, empty = 0, skipped = 0;
for (const r of rows) {
  const rel = `episodes/${r.id}`;
  const segText = await storage().get(`${rel}/script-segments.json`).then((b) => b.toString("utf8")).catch(() => null);
  if (!segText || !r.script_key) { skipped++; continue; } // 자막이 없는 편(KAN-72 이전·정렬 실패)은 구간도 없다
  const md = (await storage().get(r.script_key.replace(/^(s3|local):/, ""))).toString("utf8");
  const built = buildSections(parseScriptForTts(md).turns, JSON.parse(segText) as ScriptSegment[]);
  if (built.sections.length) made++; else empty++;
  console.log(`${r.id} ${built.sections.length ? `구간 ${built.sections.length}개${built.missingTurns ? ` [자막에서 빠진 턴 ${built.missingTurns.join("·")}]` : ""} — ${built.sections.map((s) => `${s.start_sec.toFixed(1)} ${s.title}`).join(" | ").slice(0, 160)}` : `구간 없음(${built.reason})`}`);
  if (apply) await putFile(`${rel}/script-sections.json`, JSON.stringify(built.sections, null, 1));
}
console.log(`\n대상 ${rows.length}편 · 구간 ${made}편 · 구간 없음 ${empty}편 · 자막 없어 건너뜀 ${skipped}편${apply ? " · S3 반영" : " · 점검만(--apply 로 올린다)"}`);
await pool.end();
