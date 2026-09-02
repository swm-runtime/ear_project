import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config.js";
import { pool } from "../db.js";
import { probeStorage, pushDir, storage } from "../storage.js";
import { exists } from "../util.js";

/**
 * 산출물 저장소 CLI (spec/10 3.3 · M4)
 *   npm run storage:status                              — 접근 확인 + DB 키·S3 객체 현황
 *   npm run storage:migrate [-- --apply] [-- --source <dir>]
 *       로컬(WORK_ROOT 또는 --source)의 episodes/·sources/sweeps/ 를 S3 로 올리고, DB 의 `local:`(및 접두사 없는) 키를
 *       `s3:` 로 치환한다. 기본은 계획만 출력, --apply 로 실행. 멱등 — md5 가 같은 파일은 다시 올리지 않는다.
 *       치환하지 않는 것: S3 에 객체가 없는 키, backlog/·sources/*.md 같은 로컬 기록(이관 대상 아님).
 */
const EP_KEYS = ["script_key", "claims_key", "sources_key", "qa_report_key", "critic_report_key", "audio_master_key", "audio_dist_key"] as const;

const prefixOf = (v: string) => (v.startsWith("s3:") ? "s3:" : v.startsWith("local:") ? "local:" : "(접두사 없음)");
const fmtBytes = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);
const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

async function status() {
  console.log(`저장소: ${await probeStorage()} · WORK_ROOT=${cfg.workRoot}`);
  const eps = await pool.query(`select id, ${EP_KEYS.join(", ")} from public.episodes order by id`);
  const epCount = new Map<string, number>();
  for (const r of eps.rows) for (const k of EP_KEYS) if (r[k]) count(epCount, prefixOf(r[k]));
  console.log(`episodes ${eps.rowCount}편 · 키 접두사:`, Object.fromEntries(epCount));
  const arts = await pool.query("select a from public.runs, unnest(artifacts) a");
  const artCount = new Map<string, number>();
  for (const r of arts.rows) count(artCount, prefixOf(r.a));
  console.log(`runs.artifacts ${arts.rowCount}항목 · 접두사:`, Object.fromEntries(artCount));
  for (const p of ["episodes/", "sweeps/", "datasets/"]) {
    const objs = await storage().list(p);
    const ids = new Set(objs.map((o) => o.key.split("/")[1]));
    console.log(`S3 ${p} 객체 ${objs.length} (${fmtBytes(objs.reduce((s, o) => s + o.size, 0))})${p === "episodes/" ? ` · 에피소드 ${ids.size}` : ""}`);
  }
}

async function migrate(apply: boolean, source: string) {
  console.log(`이관 원본 ${source} → ${await probeStorage()} · ${apply ? "적용" : "계획만 (--apply 로 실행)"}`);
  const planned = new Set<string>();
  let files = 0, bytes = 0;

  const epRoot = path.join(source, "episodes");
  const ids = (await exists(epRoot)) ? (await fs.readdir(epRoot, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name).sort() : [];
  for (const id of ids) {
    const r = await pushDir(path.join(epRoot, id), `episodes/${id}/`, { dryRun: !apply });
    r.uploaded.forEach((k) => planned.add(k)); files += r.uploaded.length; bytes += r.bytes;
    console.log(`  episodes/${id}/ 올림 ${r.uploaded.length} · 이미 같음 ${r.unchanged}`);
  }
  const sweepDir = path.join(source, "sources", "sweeps");
  if (await exists(sweepDir)) {
    const r = await pushDir(sweepDir, "sweeps/", { dryRun: !apply });
    r.uploaded.forEach((k) => planned.add(k)); files += r.uploaded.length; bytes += r.bytes;
    console.log(`  sweeps/ 올림 ${r.uploaded.length} · 이미 같음 ${r.unchanged}`);
  }
  console.log(`파일 ${files}개 ${fmtBytes(bytes)} ${apply ? "올림" : "올릴 예정"}`);

  // DB 키 치환 — 객체가 실제로(또는 이번 이관으로) 있는 키만
  const remote = new Set<string>(planned);
  for (const p of ["episodes/", "sweeps/"]) for (const o of await storage().list(p)) remote.add(o.key);
  const mapKey = (v: string | null): string | null => {
    if (!v || v.startsWith("s3:")) return null;
    const rel = v.replace(/^local:/, "");
    if (rel.startsWith("episodes/") && remote.has(rel)) return `s3:${rel}`;
    const m = rel.match(/^(?:sources\/)?sweeps\/(.+)$/);
    if (m && remote.has(`sweeps/${m[1]}`)) return `s3:sweeps/${m[1]}`;
    return null;
  };
  const eps = await pool.query(`select id, ${EP_KEYS.join(", ")} from public.episodes order by id`);
  const epUpdates: { id: string; set: Record<string, string> }[] = [];
  for (const r of eps.rows) {
    const set: Record<string, string> = {};
    for (const k of EP_KEYS) { const nv = mapKey(r[k]); if (nv) set[k] = nv; }
    if (Object.keys(set).length) epUpdates.push({ id: r.id, set });
  }
  const runs = await pool.query("select id, artifacts from public.runs where cardinality(artifacts) > 0 order by executed_at");
  const runUpdates: { id: string; artifacts: string[] }[] = [];
  const leftover = new Map<string, number>();
  for (const r of runs.rows) {
    let changed = false;
    const next = (r.artifacts as string[]).map((a) => {
      const nv = mapKey(a);
      if (nv) { changed = true; return nv; }
      if (!a.startsWith("s3:")) count(leftover, a);
      return a;
    });
    if (changed) runUpdates.push({ id: r.id, artifacts: next });
  }
  console.log(`DB: episodes ${epUpdates.length}편 키 치환 (${epUpdates.reduce((s, u) => s + Object.keys(u.set).length, 0)}개) · runs ${runUpdates.length}건 artifacts 치환`);
  for (const u of epUpdates) console.log(`  ${u.id}: ${Object.entries(u.set).map(([k, v]) => `${k} → ${v}`).join(", ")}`);
  if (leftover.size) console.log(`  남기는 항목(S3 대상 아님·객체 없음): ${[...leftover].map(([a, n]) => `${a}×${n}`).join(", ")}`);
  if (!apply) return;

  const c = await pool.connect();
  try {
    await c.query("begin");
    for (const u of epUpdates) {
      const cols = Object.keys(u.set);
      await c.query(`update public.episodes set updated_at = now()${cols.map((k, i) => `, ${k} = $${i + 2}`).join("")} where id = $1`, [u.id, ...cols.map((k) => u.set[k])]);
    }
    for (const u of runUpdates) await c.query("update public.runs set artifacts = $2 where id = $1", [u.id, u.artifacts]);
    await c.query("commit");
    console.log(`DB 치환 commit — episodes ${epUpdates.length} · runs ${runUpdates.length}`);
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (n: string) => rest.includes(n);
  const opt = (n: string) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    if (cmd === "status") await status();
    else if (cmd === "migrate") await migrate(flag("--apply"), path.resolve(opt("--source") ?? cfg.workRoot));
    else { console.log("사용법: storage status | storage migrate [--apply] [--source <dir>]"); process.exitCode = 2; }
  } finally { await pool.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
