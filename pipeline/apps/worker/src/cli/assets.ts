/**
 * 규칙 자산 CLI (spec/10 3.2) — git 사본과 DB 사이의 명시적 이동. 방향은 한쪽: 웹 → DB → git(export).
 *   npm run assets:import            docs/ai/skills 의 7개를 DB 에 시딩 (active 가 없는 키만. 있으면 건너뜀 — --force 로 git 사본을 새 버전으로 강제)
 *   npm run assets:export            active 를 docs/ai/skills 로 덤프 + skills/CHANGELOG-assets.md 생성 (PR 에서 규칙 diff 가 보이게)
 *   npm run assets:status            active 버전 목록
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { cfg } from "../config.js";
import { pool } from "../db.js";
import { DB_ASSET_KEYS, versionOf, workerRev } from "../assets.js";

async function cmdImport(force: boolean) {
  const by = `seed:${os.userInfo().username}@${os.hostname()}`;
  for (const key of DB_ASSET_KEYS) {
    const content = await fs.readFile(path.join(cfg.assetSourceRoot, key), "utf8");
    const version = versionOf(key, content);
    const cur = await pool.query<{ version: string; content: string }>("select version, content from public.prompt_assets where key = $1 and status = 'active'", [key]);
    const active = cur.rows[0];
    if (active && !force) {
      const same = active.content === content;
      console.log(`${same ? "=" : "≠"} ${key}  active ${active.version}${same ? "" : " (git 사본과 내용이 다름 — DB 가 진실. git 에 맞추려면 --force, DB 를 git 으로 내리려면 export)"}`);
      continue;
    }
    const v = active && active.version === version ? `${version}+${new Date().toISOString().slice(0, 10).replace(/-/g, "")}` : version;
    await pool.query(
      `insert into public.prompt_assets (key, version, content, status, note, created_by, activated_by)
       values ($1, $2, $3, 'active', $4, $5, $5)
       on conflict (key, version) do update set content = excluded.content, status = 'active', note = excluded.note`,
      [key, v, content, active ? `git 사본으로 교체 (--force, ${workerRev()})` : `초기 시딩 — git docs/ai/skills (${workerRev()})`, by],
    );
    console.log(`+ ${key}  → ${v} (active)`);
  }
}

async function cmdExport() {
  const r = await pool.query<{ key: string; version: string; content: string }>(
    "select key, version, content from public.prompt_assets where status = 'active' order by key",
  );
  for (const a of r.rows) {
    const p = path.join(cfg.assetSourceRoot, a.key);
    const prev = await fs.readFile(p, "utf8").catch(() => null);
    if (prev === a.content) { console.log(`= ${a.key}  ${a.version}`); continue; }
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, a.content, "utf8");
    console.log(`↓ ${a.key}  ${a.version} (파일 갱신)`);
  }
  const hist = await pool.query<{ key: string; version: string; status: string; note: string | null; activated_at: string | null; activated_by: string | null }>(
    "select key, version, status, note, activated_at::text, activated_by from public.prompt_assets order by key, created_at",
  );
  const lines = [
    "# 규칙 자산 활성화 이력 (생성 파일 — `npm run assets:export`)",
    "",
    "> 진실은 DB `prompt_assets` (spec/10 3.2). 이 파일과 `docs/ai/skills/` 의 본문은 export 시점의 스냅샷이다. 편집은 웹 `/assets` 에서.",
    "",
    "| 자산 | 버전 | 상태 | 활성화 | 누가 | 사유 |",
    "|---|---|---|---|---|---|",
    ...hist.rows.map((h) => `| \`${h.key}\` | ${h.version} | ${h.status} | ${h.activated_at ? h.activated_at.slice(0, 10) : "-"} | ${h.activated_by ?? "-"} | ${(h.note ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")} |`),
    "",
  ];
  const cl = path.join(cfg.assetSourceRoot, "skills", "CHANGELOG-assets.md");
  await fs.writeFile(cl, lines.join("\n"), "utf8");
  console.log(`↓ ${path.relative(cfg.assetSourceRoot, cl)} 갱신 (${hist.rows.length}행)`);
}

async function cmdStatus() {
  const r = await pool.query<{ key: string; version: string; activated_at: string | null; activated_by: string | null; drafts: number }>(
    `select a.key, a.version, a.activated_at::text, a.activated_by,
            (select count(*) from public.prompt_assets d where d.key = a.key and d.status = 'draft')::int as drafts
       from public.prompt_assets a where a.status = 'active' order by a.key`,
  );
  for (const a of r.rows) console.log(`${a.key.padEnd(52)} ${a.version.padEnd(18)} ${a.activated_at?.slice(0, 16) ?? "-"}  ${a.activated_by ?? "-"}${a.drafts ? `  (draft ${a.drafts})` : ""}`);
  const missing = DB_ASSET_KEYS.filter((k) => !r.rows.some((a) => a.key === k));
  if (missing.length) console.log(`! active 없음: ${missing.join(", ")}`);
}

const [cmd, ...rest] = process.argv.slice(2);
(async () => {
  try {
    if (cmd === "import") await cmdImport(rest.includes("--force"));
    else if (cmd === "export") await cmdExport();
    else if (cmd === "status") await cmdStatus();
    else { console.error("usage: assets <import [--force] | export | status>"); process.exitCode = 2; }
  } finally { await pool.end(); }
})();
