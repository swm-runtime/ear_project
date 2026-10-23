import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { pool } from "../db.js";
import { storage } from "../storage.js";
import { flacHasSeektable, probeDurationSec } from "../tts/audio.js";

/**
 * 무손실(FLAC) 백필 — 시크테이블을 넣어 다시 만든 파이프라인 S3 의 lossless.flac 을 제품 서버에 **무손실만 교체** 재발행으로 보낸다
 * (2026-10-23 KAN-265 · BE 경로 KAN-264: PATCH /admin/contents/:contentId, 텍스트 필드 rendition_only=lossless + 파일 audio_lossless 둘만 →
 *  lossless 행만 교체, content_version·재생 위치·대본·압축/AAC 행 그대로. 400 rendition_only(다른 파트 섞임) · 400 audio_lossless(파일 없음/길이 ±1초 밖) · 409(발행 중 아님)).
 *
 *   npm run tts:lossless-backfill -w apps/worker -- [--apply] [--dev] [--only T1,T2] [--limit N]
 *
 * 대상: 제품 content_id(backlog.published_content_ref)가 있는 발행 편 중 마지막 TTS 가 FLAC 을 만든 편. 기본은 점검(--dry-run): 대상·건수·S3 파일 길이·시크테이블만 본다.
 * --apply: 보내고 응답 content_version 을 backlog.published_version 과 비교해 다르면 경고(올라가면 안 된다), publish_log 에 action backfill 을 남긴다.
 * --dev: 개발계 제품 API(EAR_DEV_API_BASE_URL·EAR_DEV_SSO_SECRET). 기본은 운영(EAR_API_BASE_URL·EAR_SSO_SECRET).
 * 인증: 콘솔 SSO 와 같은 HS256 어서션(apps/web/lib/ear-proxy.ts signAssertion) — 이메일은 EAR_ADMIN_EMAIL(제품 서버의 관리자 계정이어야 한다). 비밀·이메일은 출력하지 않는다.
 * 피할 시간: 04:00~05:30 · 07:00 · 17:00 KST(KAN-265).
 */
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dev = args.includes("--dev");
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : undefined);
const onlyIds = opt("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const limit = Number(opt("limit") ?? 0) || 0;

const base = (dev ? process.env.EAR_DEV_API_BASE_URL ?? "https://api-dev.earcast.co.kr/api/v1" : process.env.EAR_API_BASE_URL ?? "https://api.earcast.co.kr/api/v1").replace(/\/$/, "");
const secret = dev ? process.env.EAR_DEV_SSO_SECRET : process.env.EAR_SSO_SECRET;
const email = process.env.EAR_ADMIN_EMAIL;
if (apply && (!secret || !email)) { console.error(`--apply 에는 ${dev ? "EAR_DEV_SSO_SECRET" : "EAR_SSO_SECRET"} 과 EAR_ADMIN_EMAIL 이 필요하다`); process.exit(2); }

const b64u = (b: Buffer) => b.toString("base64url");
function signAssertion(mail: string, sec: string): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64u(Buffer.from(JSON.stringify({ typ: "pipeline_sso", email: mail, iat: now, exp: now + 60 })));
  return `${head}.${body}.${b64u(createHmac("sha256", sec).update(`${head}.${body}`).digest())}`;
}
async function login(): Promise<string> {
  const res = await fetch(`${base}/auth/pipeline-login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion: signAssertion(email!, secret!), device_id: "pipeline-cli-lossless-backfill" }) });
  if (!res.ok) throw new Error(`제품 SSO 로그인 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const rows = (await pool.query<{ id: string; backlog_id: string; content_id: string; version: number | null; title: string }>(
  `select e.id, e.backlog_id, b.published_content_ref content_id, b.published_version version, b.title
     from public.episodes e join public.backlog b on b.id = e.backlog_id
    where b.status = 'published' and b.published_content_ref is not null and e.audio_master_key is not null
      and (select r.result from public.runs r where r.backlog_id = e.backlog_id and r.phase = 'tts' order by r.executed_at desc limit 1) like '%FLAC%'
      ${onlyIds ? "and e.id = any($1)" : ""}
    order by e.id ${limit ? `limit ${limit}` : ""}`,
  onlyIds ? [onlyIds] : [],
)).rows;
console.log(`${dev ? "개발계" : "운영"} ${base} · 대상 ${rows.length}편 · ${apply ? "반영(--apply)" : "점검만(--apply 로 보낸다)"}`);

let token = apply ? await login() : "";
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ear-lossless-backfill-"));
let ok = 0, skipped = 0, failed = 0; const fails: string[] = [];
for (const r of rows) {
  const key = `episodes/${r.id}/audio/lossless.flac`;
  const local = path.join(tmp, `${r.id}.flac`);
  try {
    const buf = await storage().get(key);
    await fs.writeFile(local, buf);
    if (!(await flacHasSeektable(local))) throw new Error("S3 의 FLAC 에 SEEKTABLE 없음 — encode --lossless-only 먼저");
    const dur = await probeDurationSec(local);
    const note = `${(dur / 60).toFixed(1)}분 · ${(buf.length / 1e6).toFixed(1)}MB`;
    if (!apply) { ok++; console.log(`${r.id} ${r.content_id} v${r.version ?? "?"} · ${note} · 시크테이블 있음`); continue; }
    const form = new FormData();
    form.append("rendition_only", "lossless");
    form.append("audio_lossless", new Blob([new Uint8Array(buf)], { type: "audio/flac" }), "lossless.flac");
    let res = await fetch(`${base}/admin/contents/${r.content_id}`, { method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: form });
    if (res.status === 401) { token = await login(); res = await fetch(`${base}/admin/contents/${r.content_id}`, { method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: form }); }
    if (res.status === 409) { skipped++; console.log(`${r.id} ${r.content_id} 건너뜀 — 발행 중 아님(409)`); await pool.query("insert into public.publish_log (content_id, backlog_id, episode_id, action, version, parts, note, actor) values ($1,$2,$3,'backfill',$4,'{}',$5,'cli:lossless-backfill')", [r.content_id, r.backlog_id, r.id, r.version, "무손실 백필 건너뜀 — 409 발행 중 아님"]); continue; }
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 220)}`);
    const item = (await res.json()) as { content_version?: number };
    const v = item.content_version ?? null;
    const warn = r.version != null && v != null && v !== r.version ? ` ⚠ content_version ${r.version} → ${v}` : "";
    await pool.query("insert into public.publish_log (content_id, backlog_id, episode_id, action, version, parts, note, actor) values ($1,$2,$3,'backfill',$4,$5,$6,'cli:lossless-backfill')", [r.content_id, r.backlog_id, r.id, v, ["audio_lossless"], `무손실 백필(KAN-265) — SEEKTABLE 넣은 FLAC 으로 교체 · ${note} · 버전 유지${warn ? " 아님" : ""}`]);
    ok++; console.log(`${r.id} ${r.content_id} v${v} · ${note} · 교체${warn}`);
  } catch (e: any) {
    failed++; const m = `${r.id} ${r.content_id} 실패 — ${String(e?.message ?? e).slice(0, 200)}`; fails.push(m); console.log(m);
  } finally {
    await fs.rm(local, { force: true });
  }
}
await fs.rm(tmp, { recursive: true, force: true });
console.log(`\n대상 ${rows.length} · ${apply ? "교체" : "점검 통과"} ${ok} · 건너뜀 ${skipped} · 실패 ${failed}`);
if (fails.length) console.log(fails.join("\n"));
await pool.end();
