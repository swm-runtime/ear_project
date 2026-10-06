import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { enqueue, insertRun, pool } from "../db.js";
import { putFile, s3Key, storage } from "../storage.js";
import { workerRev } from "../assets.js";
import { encodeRenditions, probeDurationSec } from "../tts/audio.js";

/**
 * 배포본 재인코딩 (2026-10-06 KAN-142 — 음질 확정: Light·Daily AAC 192k, Pro FLAC) — TTS 없이 S3 의 master.wav 에서
 * dist.m4a(AAC 192k, faststart) + lossless.flac 을 만든다. 크레딧이 들지 않는다.
 *   npm run tts:encode -w apps/worker [-- --apply] [-- --ids T1,T2]
 * 대상(기본): 마지막 TTS 가 무손실 원본(run 결과 "ElevenLabs 원본 wav_44100")으로 만든 마스터이고 배포본이 아직 dist.m4a 가 아닌 편.
 *   그 전 마스터는 mp3 128k 원본을 디코드한 것이라 다시 인코딩해도 나아지지 않는다(--ids 로 지정하면 그래도 한다).
 * 점검(기본): 로컬에서 만들고 길이·형식만 확인한다. --apply: 두 파일을 올리고 episodes.audio_dist_key 를 dist.m4a 로 바꾸고,
 *   runs 에 phase tts 를 남기고(콘솔 재발행 판정 — 발행 뒤 TTS 실행이 있으면 오디오 교체), 패키지를 다시 건다(upload-meta 가 새 키를 가리키게).
 *   옛 dist.mp3 는 지우지 않는다 — 되돌릴 때 쓴다.
 */
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : undefined);
const onlyIds = opt("ids")?.split(",").map((s) => s.trim()).filter(Boolean);

const rows = (await pool.query<{ id: string; backlog_id: string; audio_master_key: string; status: string }>(
  `select e.id, e.backlog_id, e.audio_master_key, b.status
     from public.episodes e join public.backlog b on b.id = e.backlog_id
    where e.audio_master_key is not null
      ${onlyIds ? "and e.id = any($1)" : `and coalesce(e.audio_dist_key, '') not like '%/dist.m4a'
      and (select r.result from public.runs r where r.backlog_id = e.backlog_id and r.phase = 'tts' order by r.executed_at desc limit 1) like '%ElevenLabs 원본 wav_44100%'`}
    order by e.id`,
  onlyIds ? [onlyIds] : [],
)).rows;

/** m4a 최상위 상자 순서 — moov 가 mdat 앞이어야 앞부분만 받아도 재생이 시작된다 */
async function moovFirst(file: string): Promise<boolean> {
  const b = await fs.readFile(file);
  for (let i = 0; i + 8 <= b.length; ) {
    const size = b.readUInt32BE(i), type = b.toString("latin1", i + 4, i + 8);
    if (type === "moov") return true;
    if (type === "mdat") return false;
    if (size < 8) return false;
    i += size;
  }
  return false;
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ear-encode-"));
let done = 0, failed = 0;
for (const r of rows) {
  const rel = `episodes/${r.id}`;
  const dir = path.join(tmp, r.id);
  await fs.mkdir(dir, { recursive: true });
  try {
    const master = path.join(dir, "master.wav"), dist = path.join(dir, "dist.m4a"), lossless = path.join(dir, "lossless.flac");
    await fs.writeFile(master, await storage().get(r.audio_master_key.replace(/^(s3|local):/, "")));
    await encodeRenditions(master, { distOut: dist, losslessOut: lossless });
    const [m, d, l] = await Promise.all([probeDurationSec(master), probeDurationSec(dist), probeDurationSec(lossless)]);
    if (Math.abs(d - m) > 0.1 || Math.abs(l - m) > 0.01) throw new Error(`길이 불일치 master ${m.toFixed(3)} · m4a ${d.toFixed(3)} · flac ${l.toFixed(3)}`);
    if (!(await moovFirst(dist))) throw new Error("m4a moov 가 앞에 없음 (faststart 실패)");
    const [ds, ls] = await Promise.all([fs.stat(dist), fs.stat(lossless)]);
    const note = `${(m / 60).toFixed(1)}분 · m4a ${(ds.size / 1e6).toFixed(1)}MB · flac ${(ls.size / 1e6).toFixed(1)}MB`;
    if (apply) {
      await putFile(`${rel}/audio/dist.m4a`, await fs.readFile(dist));
      await putFile(`${rel}/audio/lossless.flac`, await fs.readFile(lossless));
      await pool.query("update public.episodes set audio_dist_key = $2 where id = $1", [r.id, s3Key(`${rel}/audio/dist.m4a`)]);
      await insertRun({ backlog_id: r.backlog_id, phase: "tts", result: `배포본 재인코딩(KAN-142) — master.wav → dist.m4a(AAC 192k) + lossless.flac · TTS 없음 · ${note} · 옛 dist.mp3 는 남김 · 앱 반영은 콘솔 재발행`, prompt_version: "tts-v1 (encode)", artifacts: [s3Key(`${rel}/audio/dist.m4a`), s3Key(`${rel}/audio/lossless.flac`)], executed_by: `cli:${os.userInfo().username}`, worker_rev: workerRev() });
      if (["qa_passed", "packaged", "published", "review_required"].includes(r.status)) await enqueue({ type: "package", requires_ai: false, payload: { episode_id: r.id, backlog_id: r.backlog_id } });
    }
    done++;
    console.log(`${r.id} ${note}${apply ? " · 반영" : ""}`);
  } catch (e: any) {
    failed++;
    console.log(`${r.id} 실패 — ${String(e?.message ?? e).slice(0, 160)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
await fs.rm(tmp, { recursive: true, force: true });
console.log(`\n대상 ${rows.length}편 · 완료 ${done} · 실패 ${failed}${apply ? " · S3·DB 반영(패키지 재실행 걸림)" : " · 점검만(--apply 로 올린다)"}`);
await pool.end();
