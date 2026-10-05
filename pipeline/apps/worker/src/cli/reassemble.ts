import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cfg } from "../config.js";
import { insertRun, pool } from "../db.js";
import { storage } from "../storage.js";
import { workerRev } from "../assets.js";
import { assemble, probeDurationSec, type Segment } from "../tts/audio.js";

/**
 * 발행분 재조립 (2026-10-05 KAN-122) — TTS 를 다시 하지 않고, 옛 조립(징글까지 모노·1패스 loudnorm)의 마스터에서 본편만 잘라 새 조립으로 다시 붙인다.
 *   npm run tts:reassemble [-- --apply] [-- --ids T1,T2] [-- --limit N]
 * 대상: 마스터가 있고, 마지막 TTS 실행이 "징글 포함"이면서 새 조립 표시("본편만 2패스")가 없는 편. 마스터가 이미 스테레오면 건너뛴다.
 * 본편 구간: 옛 마스터는 [인트로 파일][본편][아웃트로 파일]을 이어 정규화한 것이고 징글 파일 앞뒤 1초는 디지털 0 이다 —
 *   시작 = 실행 기록의 인트로 길이(그 근처에서 끝나는 0 구간이 있으면 그 끝), 끝 = 마지막 0.9초 이상 0 구간(아웃트로 앞 여백)의 시작.
 * 새 조립: 그 본편을 세그먼트 하나로 assemble 에 넘긴다 — 본편만 2패스 linear, 스테레오, 현재 S3 징글. 본편은 옛 1패스 정규화를 이미 거쳤으므로
 *   고정 게인이 조금 더 걸릴 뿐이다. 인트로 길이가 1ms 넘게 달라지면 자막 시각(script-segments.json)을 그만큼 민다.
 * --apply: 옛 master.wav 를 audio/pre-kan122/ 에 남기고(배포본은 마스터에서 다시 만들 수 있어 남기지 않는다 — 전송량) 새 파일을 올린 뒤 runs 에 phase tts 를 기록한다 — 콘솔 재발행 판정
 *   (actions.ts republishPlans: 발행 뒤 TTS 실행이 있으면 오디오 교체)이 이 기록을 본다. 앱 반영은 콘솔 [구형 전체 재발행] — 이 CLI 는 제품에 보내지 않는다.
 * 기본은 점검(로컬에서 만들고 측정만).
 */
const run = promisify(execFile);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : undefined);
const onlyIds = opt("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
const limit = Number(opt("limit") ?? Infinity);
const RATE = 44100;

/** s16le mono PCM 에서 길이 minSec 이상인 정확한 0 구간들 [시작, 끝](샘플) */
function zeroRuns(pcm: Buffer, minSec: number): [number, number][] {
  const n = pcm.length >> 1, min = Math.round(minSec * RATE), out: [number, number][] = [];
  for (let i = 0; i < n; ) {
    if (pcm.readInt16LE(i * 2) !== 0) { i++; continue; }
    let j = i; while (j < n && pcm.readInt16LE(j * 2) === 0) j++;
    if (j - i >= min) out.push([i, j]);
    i = j;
  }
  return out;
}

const decode = async (file: string, extra: string[]) =>
  (await run("ffmpeg", ["-v", "error", ...extra, "-i", file, "-f", "s16le", "-ac", "1", "-ar", String(RATE), "-"], { encoding: "buffer", maxBuffer: 1 << 30 })).stdout as unknown as Buffer;
const channelsOf = async (f: string) => Number((await run("ffprobe", ["-v", "error", "-show_entries", "stream=channels", "-of", "csv=p=0", f])).stdout.trim());
const sliceLufs = async (f: string, ss: number, t: number) => {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-ss", ss.toFixed(3), "-t", t.toFixed(3), "-i", f, "-af", "ebur128", "-f", "null", "-"], { maxBuffer: 1 << 26 });
  return Number(stderr.slice(stderr.lastIndexOf("Summary:")).match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
};

const eps = await pool.query<{ id: string; backlog_id: string; prompt_version: string; status: string; published_at: string | null; result: string | null }>(
  `select e.id, e.backlog_id, e.prompt_version, b.status, b.published_at,
     (select r.result from public.runs r where r.backlog_id = e.backlog_id and r.phase = 'tts' and r.result not like '%샘플%' order by r.executed_at desc limit 1) as result
   from public.episodes e join public.backlog b on b.id = e.backlog_id
   where e.audio_master_key is not null order by e.id`);
const targets = eps.rows.filter((r) => (onlyIds ? onlyIds.includes(r.id) : true) && r.result?.includes("징글 포함") && !r.result.includes("본편만 2패스")).slice(0, limit);
const skippedNoJingle = eps.rows.filter((r) => !onlyIds && !r.result?.includes("징글 포함")).length;
console.log(`대상 ${targets.length}편 (마스터 있는 편 ${eps.rows.length} · 징글 없던 옛 편 ${skippedNoJingle}편은 그대로) · ${apply ? "반입(--apply)" : "점검"}`);

const work = await fs.mkdtemp(path.join(os.tmpdir(), "reassemble-"));
const jdir = path.join(work, "jingle");
await fs.mkdir(jdir, { recursive: true });
const introFile = path.join(jdir, "intro.wav"), outroFile = path.join(jdir, "outro.wav");
await fs.writeFile(introFile, await storage().get(cfg.ttsIntroKey));
await fs.writeFile(outroFile, await storage().get(cfg.ttsOutroKey));
const rateOf = async (f: string) => Number((await run("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", f])).stdout.trim());
const relevelled = (await channelsOf(introFile)) === 2 && (await rateOf(introFile)) === RATE && (await rateOf(outroFile)) === RATE; // npm run jingle 이 올린 징글은 44.1kHz 스테레오
if (!relevelled) { if (apply) throw new Error("S3 징글이 아직 옛 파일(48kHz)이다 — 먼저 npm run jingle -- --relevel 로 다시 올린다"); console.log("⚠️ S3 징글이 옛 파일이다 — 점검만(--apply 불가)"); }

let ok = 0, failed = 0;
for (const ep of targets) {
  const dir = path.join(work, ep.id);
  await fs.mkdir(dir, { recursive: true });
  try {
    const oldIntro = Number(ep.result!.match(/인트로 (\d+(?:\.\d+)?)초/)?.[1]);
    if (!Number.isFinite(oldIntro)) throw new Error("실행 기록에서 인트로 길이를 못 읽었다");
    const master = path.join(dir, "old-master.wav");
    await fs.writeFile(master, await storage().get(`episodes/${ep.id}/audio/master.wav`));
    if ((await channelsOf(master)) === 2) { console.log(`${ep.id} 이미 스테레오 — 건너뜀`); continue; }
    const total = await probeDurationSec(master);
    // 시작: 인트로 뒤 0 구간의 끝 (실행 기록 값 ±20ms 안에서)
    const head = zeroRuns(await decode(master, ["-t", String(oldIntro + 1)]), 0.3);
    const headEnd = head.map(([, e]) => e).find((e) => Math.abs(e / RATE - oldIntro) < 0.02);
    const startS = headEnd ?? Math.round(oldIntro * RATE);
    // 끝: 마지막에서 두 번째 0.9초 이상 0 구간(첫째는 아웃트로 끝 여백)의 시작
    const tailSec = Math.min(40, total);
    const tail = zeroRuns(await decode(master, ["-sseof", `-${tailSec}`]), 0.9);
    if (tail.length < 2) throw new Error(`아웃트로 앞 여백(0 구간)을 못 찾았다 (꼬리 0 구간 ${tail.length}개)`);
    const tailBase = Math.round((total - tailSec) * RATE);
    const endS = tailBase + tail[tail.length - 2][0];
    const all = await decode(master, []);
    const voice = all.subarray(startS * 2, endS * 2);
    if (voice.length < RATE * 2 * 60) throw new Error(`본편이 ${(voice.length / 2 / RATE).toFixed(1)}초 — 구간 판정 실패`);
    const seg: Segment = { data: Buffer.from(voice), format: "pcm_44100" };
    const newMaster = path.join(dir, "master.wav"), newDist = path.join(dir, "dist.mp3");
    const asm = await assemble({ segments: [seg], gapSec: [], workDir: dir, masterOut: newMaster, distOut: newDist, introFile, outroFile });
    const delta = Math.round((asm.introSec - startS / RATE) * 1000) / 1000;
    const introL = await sliceLufs(newDist, 0, asm.introSec), bodyL = await sliceLufs(newDist, asm.introSec + 1, Math.min(300, voice.length / 2 / RATE - 2));
    const note = `재조립(KAN-122) — 옛 마스터에서 본편 ${(voice.length / 2 / RATE).toFixed(1)}초를 잘라 새 조립: 정규화 본편만 2패스 ${asm.loudness.type} ${asm.loudness.targetI} LUFS(측정 ${asm.loudness.measuredI}·TP ${asm.loudness.measuredTp} → 출력 ${asm.loudness.outputI}·TP ${asm.loudness.outputTp}) · 스테레오 · 징글 인트로 ${asm.introSec}초(옛 ${(startS / RATE).toFixed(3)}초, 차 ${delta}초) · 배포본 인트로 ${introL} / 본편 ${bodyL} LUFS · ${Math.floor(asm.durationSec / 60)}분 ${Math.round(asm.durationSec % 60)}초`;
    if (asm.loudness.type !== "linear") throw new Error(`선형 정규화 실패(${asm.loudness.type}) — ${note}`);
    if (introL > bodyL) throw new Error(`인트로가 본편보다 크다 — ${note}`);
    if (apply) {
      const s = storage();
      await s.put(`episodes/${ep.id}/audio/pre-kan122/master.wav`, await fs.readFile(master), "audio/wav");
      if (Math.abs(delta) > 0.001) {
        const segKey = `episodes/${ep.id}/script-segments.json`;
        const segs = JSON.parse((await s.get(segKey)).toString("utf-8")) as { start: number; end: number }[];
        await s.put(`episodes/${ep.id}/audio/pre-kan122/script-segments.json`, Buffer.from(JSON.stringify(segs, null, 1)), "application/json");
        await s.put(segKey, Buffer.from(JSON.stringify(segs.map((x) => ({ ...x, start: Math.round((x.start + delta) * 1000) / 1000, end: Math.round((x.end + delta) * 1000) / 1000 })), null, 1)), "application/json");
      }
      await s.put(`episodes/${ep.id}/audio/master.wav`, await fs.readFile(newMaster), "audio/wav");
      await s.put(`episodes/${ep.id}/audio/dist.mp3`, await fs.readFile(newDist), "audio/mpeg");
      await insertRun({ backlog_id: ep.backlog_id, phase: "tts", result: `${note} · 옛 파일 audio/pre-kan122/ · 앱 반영은 콘솔 재발행`, prompt_version: "tts-v1 (reassemble)", artifacts: [`s3:episodes/${ep.id}/audio/master.wav`, `s3:episodes/${ep.id}/audio/dist.mp3`], executed_by: `cli:${os.userInfo().username}`, worker_rev: workerRev() });
    }
    ok++;
    console.log(`${ep.id} (${ep.status}${ep.published_at ? " 발행" : ""}) ✓ ${note}`);
  } catch (e: any) {
    failed++;
    console.log(`${ep.id} ✗ ${String(e?.message ?? e).slice(0, 400)}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
await fs.rm(work, { recursive: true, force: true });
console.log(`\n완료 ${ok}편 · 실패 ${failed}편${apply ? " · 콘솔 발행 화면 [구형 전체 재발행]으로 앱에 반영한다" : " · --apply 로 반입"}`);
await pool.end();
