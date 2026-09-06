/**
 * 규칙 자산 로더 (spec/10 3.2) — 워커가 모델에게 건네는 규칙은 DB(prompt_assets)가 진실이다.
 *
 * - DB 자산 7개(guidelines·골드 3·QA 프롬프트·루브릭 v1/v2)는 active(또는 에피소드에 고정된 버전)를 읽는다.
 * - spec/03·04·05 는 git 체크아웃(ASSET_ROOT = docs/ai)에서 그대로 복사한다 — 명세 본문은 git 이 진실(하이브리드).
 * - 둘을 WORK_ROOT/assets/<번들 해시>/ 에 같은 경로 레이아웃으로 내려놓아 그 디렉토리를 그 실행의 assetRoot 로 쓴다.
 *   (assetPaths 의 상대 링크 — qa/prompt.md → ../../spec/05-qa.md — 가 스냅샷 안에서도 살아 있다)
 * - 자산이 없으면 기동 실패. 조용히 git 으로 폴백하지 않는다 (시딩: npm run assets:import).
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cfg } from "./config.js";
import { pool } from "./db.js";
import { exists, log } from "./util.js";

/** DB 가 진실인 프롬프트 번들 자산 7개 — 키 = packages/pipeline assetPaths 가 만드는 경로. TTS 음차 사전은 TTS_DICT_KEY (번들·고정 제외) */
export const DB_ASSET_KEYS = [
  "skills/draft/guidelines.md",
  "skills/draft/examples/gold-T260820-001-short.md",
  "skills/draft/examples/gold-T260820-002-full.md",
  "skills/draft/examples/gold-T260828-001-full.md",
  "skills/qa/prompt.md",
  "skills/critic/rubric.md",
  "skills/critic/rubric-v2.md",
] as const;

/** TTS 전역 음차 사전 (spec/06 6장) — 8번째 DB 자산. 프롬프트 번들에 넣지 않고 에피소드에 고정하지 않는다: 항상 active — 사전 수정 → 같은 에피소드 재합성에 즉시 적용 */
export const TTS_DICT_KEY = "skills/tts/pronunciation.json";

/** 전역 음차 사전의 active 버전을 읽는다. 형식: {"표기": "발음"} JSON 객체 (문자열 값만) */
export async function loadTtsDict(): Promise<{ version: string; entries: Record<string, string> }> {
  const r = await pool.query<Row>("select key, version, content from public.prompt_assets where status = 'active' and key = $1", [TTS_DICT_KEY]);
  const row = r.rows[0];
  if (!row) throw new Error(`prompt_assets 에 active 자산이 없다: ${TTS_DICT_KEY} — 시딩(npm run assets:import) 또는 웹 /assets 에서 활성화 (spec/06 6장)`);
  let parsed: unknown;
  try { parsed = JSON.parse(row.content); }
  catch { throw new Error(`${TTS_DICT_KEY}@${row.version} 이 JSON 이 아니다 — 웹 /assets 에서 {"표기": "발음"} 객체로 고쳐 활성화`); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${TTS_DICT_KEY}@${row.version} 은 {"표기": "발음"} 객체여야 한다`);
  const entries: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (!k.trim() || typeof v !== "string" || !v.trim()) throw new Error(`${TTS_DICT_KEY}@${row.version} 항목이 잘못됐다 ("${k}": ${JSON.stringify(v)}) — 값은 비어 있지 않은 문자열`);
    entries[k] = v;
  }
  return { version: row.version, entries };
}
/** git 체크아웃에서 복사하는 명세 — 프롬프트가 경로로 반입한다 */
export const GIT_ASSET_KEYS = ["spec/03-backlog.md", "spec/04-script.md", "spec/05-qa.md"] as const;

export interface AssetBundle {
  /** DB 자산 key → version. episodes.asset_versions 에 그대로 고정된다 */
  versions: Record<string, string>;
  /** 스냅샷에 쓸 파일 전부 (DB 7 + spec 3) */
  contents: Record<string, string>;
  /** spec 3개 본문 해시 — git 의 spec 이 바뀌면 번들 해시도 바뀐다 */
  specDigest: string;
  /** 스냅샷 디렉토리 이름 */
  hash: string;
  /** runs.prompt_version 에 쓰는 단계별 라벨 (기존 의미 유지: draft = guidelines 버전) */
  labels: { draft: string; qa: string; critic: string; criticV2: string };
}

/** git 사본 파일의 헤더에서 버전 라벨을 읽는다 (시딩용). 골드 예시는 본문에 다른 버전 문구("full-v3 생성 → …")가 섞이므로 무조건 gold@날짜 */
export function versionOf(key: string, content: string): string {
  if (key === TTS_DICT_KEY) return "tts-v1"; // JSON 사전 — 헤더가 없다. 이후 버전은 웹 /assets 편집에서 tts-v1.1 식으로 올린다
  const head = content.split("\n").slice(0, 8).join("\n");
  if (key.includes("/examples/")) {
    const d = head.match(/\d{4}-\d{2}-\d{2}/);
    return `gold@${d ? d[0] : new Date().toISOString().slice(0, 10)}`;
  }
  const m = head.match(/(full|qa|critic)-v\d+(?:\.\d+)*/);
  if (!m) throw new Error(`${key}: 헤더에서 버전 라벨을 찾지 못했다 (full-vN · qa-vN · critic-vN)`);
  return m[0];
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const here = path.dirname(fileURLToPath(import.meta.url));
let _rev: string | null = null;

/** 워커 체크아웃 커밋 SHA(+dirty) — git 에 남는 spec 이 어느 판이었는지 runs.worker_rev 에 남긴다 */
export function workerRev(): string {
  if (_rev) return _rev;
  try {
    const root = path.resolve(here, "..", "..", "..", "..");
    const opt: import("node:child_process").ExecFileSyncOptionsWithStringEncoding = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
    const shaShort = execFileSync("git", ["-C", root, "rev-parse", "--short", "HEAD"], opt).trim();
    const dirty = execFileSync("git", ["-C", root, "status", "--porcelain", "--", "docs/ai", "pipeline"], opt).trim().length > 0;
    _rev = shaShort + (dirty ? "-dirty" : "");
  } catch {
    _rev = process.env.WORKER_REV || "unknown"; // 컨테이너에는 .git 이 없다 — 빌드가 박은 리비전 (deploy/Dockerfile)
  }
  return _rev;
}

type Row = { key: string; version: string; content: string };

/** active 묶음(또는 고정 버전)을 읽는다. 고정 묶음에 없는 키(나중에 추가된 자산)는 active 로 보충한다 */
export async function loadBundle(pinned?: Record<string, string> | null): Promise<AssetBundle> {
  const keys: string[] = [...DB_ASSET_KEYS];
  const versions: Record<string, string> = {};
  const contents: Record<string, string> = {};
  if (pinned) {
    const pk = keys.filter((k) => k in pinned);
    const r = await pool.query<Row>(
      "select key, version, content from public.prompt_assets where (key, version) in (select k, v from unnest($1::text[], $2::text[]) as t(k, v))",
      [pk, pk.map((k) => pinned[k])],
    );
    for (const x of r.rows) { versions[x.key] = x.version; contents[x.key] = x.content; }
    const lost = pk.filter((k) => !(k in versions));
    if (lost.length) throw new Error(`에피소드에 고정된 자산 버전이 DB 에 없다: ${lost.map((k) => `${k}@${pinned[k]}`).join(", ")} — 버전은 삭제하지 않는다(retired 로만)`);
  }
  const need = keys.filter((k) => !(k in versions));
  if (need.length) {
    const r = await pool.query<Row>("select key, version, content from public.prompt_assets where status = 'active' and key = any($1::text[])", [need]);
    for (const x of r.rows) { versions[x.key] = x.version; contents[x.key] = x.content; }
  }
  const missing = keys.filter((k) => !(k in versions));
  if (missing.length) {
    throw new Error(`prompt_assets 에 active 자산이 없다: ${missing.join(", ")} — 시딩(npm run assets:import) 또는 웹 /assets 에서 활성화 (폴백 없음, spec/10 3.2)`);
  }
  for (const k of GIT_ASSET_KEYS) {
    const p = path.join(cfg.assetSourceRoot, k);
    try { contents[k] = await fs.readFile(p, "utf8"); }
    catch { throw new Error(`명세 파일이 없다: ${p} — ASSET_ROOT 는 레포의 docs/ai 여야 한다`); }
  }
  const specDigest = sha(GIT_ASSET_KEYS.map((k) => contents[k]).join(" ")).slice(0, 8);
  const hash = sha(JSON.stringify(Object.entries(versions).sort()) + specDigest).slice(0, 12);
  const v = (k: string) => versions[k];
  return {
    versions, contents, specDigest, hash,
    labels: { draft: v("skills/draft/guidelines.md"), qa: v("skills/qa/prompt.md"), critic: v("skills/critic/rubric.md"), criticV2: v("skills/critic/rubric-v2.md") },
  };
}

/** 번들을 WORK_ROOT/assets/<hash>/ 에 파일로 내려놓는다 (같은 해시면 재사용). 반환 = 그 실행의 assetRoot */
export async function materialize(b: AssetBundle): Promise<string> {
  const dir = path.join(cfg.workRoot, "assets", b.hash);
  const marker = path.join(dir, ".complete.json");
  if (await exists(marker)) return dir;
  for (const [key, content] of Object.entries(b.contents)) {
    const p = path.join(dir, key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content, "utf8");
  }
  await fs.writeFile(marker, JSON.stringify({ versions: b.versions, spec_digest: b.specDigest, worker_rev: workerRev(), at: new Date().toISOString() }, null, 1));
  log(`  자산 스냅샷 ${b.hash} 생성 — ${Object.entries(b.versions).map(([k, v]) => `${path.basename(k)}@${v}`).join(" · ")} · spec ${b.specDigest}`);
  return dir;
}

/** 단계 진입점: 고정 버전이 있으면 그것, 없으면 active. 반환된 assetRoot 를 프롬프트 빌더와 --add-dir 에 넘긴다 */
export async function prepareAssets(pinned?: Record<string, string> | null): Promise<{ assetRoot: string; bundle: AssetBundle }> {
  const bundle = await loadBundle(pinned);
  const assetRoot = await materialize(bundle);
  return { assetRoot, bundle };
}
