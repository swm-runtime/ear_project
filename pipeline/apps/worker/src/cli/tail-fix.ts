import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { executedBy } from "../config.js";
import { insertRun, pool } from "../db.js";
import { storage } from "../storage.js";
import { workerRev } from "../assets.js";
import { encodeRenditions, pcmTrailingBlip } from "../tts/audio.js";

/**
 * 끝 덧말 수리 (2026-10-08 박수헌 "마지막 인사 뒤 대본에 없는 '네~'가 들린다") — TTS 를 다시 하지 않고 master.wav 의 본편 끝에 남은 덧말 조각을
 * 무음으로 바꾼 뒤 dist.m4a·lossless.flac 을 다시 만든다. 크레딧이 들지 않고 길이·자막 시각은 그대로다.
 *   npm run tts:tailfix -w apps/worker [-- --apply] [-- --ids T1,T2] [-- --force]
 * 대상(기본): 마지막 TTS 실행이 "끝 꼬리 폴백"으로 자른 편 — 폴백은 강제 정렬의 덧말 시작 직전에서 잘랐고 그 시각이 실제보다 늦어 "네" 앞부분이 남았다
 *   (eleven_v4 재합성 56편 중 38편). 자연 감쇠로 자른 편은 덧말 앞 쉼에서 잘려 남지 않는다. 검수(trailingBlip)는 대본이 쉼 뒤 짧은 낱말로 끝나는 편
 *   ("있지, 하고요." — T260831-002)을 오탐하므로 폴백 편으로 좁힌다. --ids 로 지정해도 폴백 편이 아니면 건너뛴다(--force 로 강제).
 * 본편 끝: 마스터는 [인트로 파일][본편][아웃트로 파일]이고 징글 파일 앞뒤 1초는 디지털 0 이다 — 파일 끝 0 구간 앞의 마지막 0.9초 이상 0 구간 시작.
 * 수리: 본편 끝 1.5초를 검수(pcmTrailingBlip)해 [마지막 낱말 끝 + min(0.1, 쉼/2), 본편 끝]을 0 으로(앞 30ms 페이드). 다시 검수해 남은 게 없을 때만 쓴다.
 * 점검(기본): 수리 전후 본편 끝 4초를 S3 datasets/pilot/tail-fix/<id>-before|after.m4a 에 올린다(청취 확인용 — 제품 산출물 아님).
 * --apply: 옛 master·dist·flac 을 audio/pre-tailfix/ 에 두고 새 파일을 올린 뒤 runs 에 phase tts 를 남긴다 — 콘솔 재발행 판정(발행 뒤 TTS 실행이 있으면
 *   오디오 교체)이 이 기록을 본다. 앱 반영은 콘솔 재발행(오디오가 바뀌어 재생 위치가 초기화된다 — admin-api 4.10).
 */
const run = promisify(execFile);
const args = process.argv.slice(2);
const apply = args.includes("--apply"), force = args.includes("--force");
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : undefined);
const onlyIds = opt("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
const RATE = 44100, WIN = 1.5;

const eps = (await pool.query<{ id: string; backlog_id: string; result: string | null }>(
  `select e.id, e.backlog_id,
          (select r.result from public.runs r where r.backlog_id = e.backlog_id and r.phase = 'tts' order by r.executed_at desc limit 1) as result
     from public.episodes e
    where e.audio_master_key is not null ${onlyIds ? "and e.id = any($1)" : ""}
    order by e.id`, onlyIds ? [onlyIds] : [])).rows;
const isFallback = (r: string | null) => !!r && r.includes("끝 꼬리 폴백");
const targets = eps.filter((e) => isFallback(e.result) || (force && onlyIds));
const skipped = eps.filter((e) => !targets.includes(e));
console.log(`대상 ${targets.length}편${skipped.length && onlyIds ? ` · 폴백 편이 아니라 건너뜀 ${skipped.map((e) => e.id).join(", ")}(--force 로 강제)` : ""} · ${apply ? "반입(--apply)" : "점검"}`);

/** s16le 스테레오 PCM 에서 두 채널이 모두 0 인 구간들 [시작, 끝](프레임), 길이 minSec 이상 */
function zeroRuns(pcm: Buffer, minSec: number): [number, number][] {
  const n = pcm.length >> 2, min = Math.round(minSec * RATE), out: [number, number][] = [];
  for (let i = 0; i < n; ) {
    if (pcm.readInt32LE(i * 4) !== 0) { i++; continue; }
    let j = i; while (j < n && pcm.readInt32LE(j * 4) === 0) j++;
    if (j - i >= min) out.push([i, j]);
    i = j;
  }
  return out;
}
/** 스테레오 PCM 의 [from, to) 프레임에서 왼쪽 채널만 s16le 모노로 — 본편은 모노를 두 채널에 같게 실었다 */
const leftMono = (pcm: Buffer, from: number, to: number) => { const b = Buffer.alloc((to - from) * 2); for (let i = from; i < to; i++) b.writeInt16LE(pcm.readInt16LE(i * 4), (i - from) * 2); return b; };
const ffmpeg = (a: string[], input?: Buffer) => new Promise<void>((res, rej) => { const p = execFile("ffmpeg", ["-v", "error", "-y", ...a], { maxBuffer: 1 << 26 }, (e) => (e ? rej(e) : res())); if (input) { p.stdin!.end(input); } });

const work = await fs.mkdtemp(path.join(os.tmpdir(), "tailfix-"));
let fixed = 0, clean = 0, failed = 0;
for (const ep of targets) {
  const dir = path.join(work, ep.id);
  await fs.mkdir(dir, { recursive: true });
  try {
    const s = storage();
    const masterFile = path.join(dir, "master.wav");
    await fs.writeFile(masterFile, await s.get(`episodes/${ep.id}/audio/master.wav`));
    const pcm = (await run("ffmpeg", ["-v", "error", "-i", masterFile, "-f", "s16le", "-ac", "2", "-ar", String(RATE), "-"], { encoding: "buffer", maxBuffer: 1 << 30 })).stdout as unknown as Buffer;
    const total = pcm.length >> 2;
    const runs = zeroRuns(pcm, 0.9).filter(([, e]) => e < total - 1);
    if (!runs.length) throw new Error("아웃트로 앞 0 구간을 못 찾음");
    const bodyEnd = runs[runs.length - 1][0];
    if (total - bodyEnd > 15 * RATE || total - bodyEnd < 2 * RATE) throw new Error(`본편 끝이 이상함 (파일 끝 ${((total - bodyEnd) / RATE).toFixed(1)}초 앞)`);
    const w0 = bodyEnd - Math.round(WIN * RATE);
    const blip = pcmTrailingBlip(leftMono(pcm, w0, bodyEnd), WIN, RATE);
    if (!blip) { clean++; console.log(`${ep.id} 남은 덧말 없음 — 그대로`); continue; }
    const cutAt = w0 + Math.round((blip.prevEnd + Math.min(0.1, blip.gap / 2)) * RATE);
    const fade = Math.round(0.03 * RATE);
    const out = Buffer.from(pcm);
    for (let i = cutAt - fade; i < bodyEnd; i++) {
      const g = i < cutAt ? (cutAt - i) / fade : 0;
      for (const c of [0, 2]) out.writeInt16LE(Math.round(out.readInt16LE(i * 4 + c) * g), i * 4 + c);
    }
    const after = pcmTrailingBlip(leftMono(out, w0, bodyEnd), WIN, RATE);
    if (after) throw new Error(`수리 뒤에도 덧말 의심(${after.start.toFixed(2)}~${after.end.toFixed(2)})`);
    const newMaster = path.join(dir, "master.new.wav"), distOut = path.join(dir, "dist.m4a"), losslessOut = path.join(dir, "lossless.flac");
    await ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "2", "-i", "-", "-c:a", "pcm_s16le", newMaster], out);
    await encodeRenditions(newMaster, { distOut, losslessOut });
    const removed = (bodyEnd - cutAt) / RATE, blipSec = blip.end - blip.start;
    const note = `끝 덧말 제거(tail-fix) — 본편 끝 ${removed.toFixed(2)}초 무음(마지막 낱말 뒤 ${blip.gap.toFixed(2)}초에 남은 ${blipSec.toFixed(2)}초 덧말) · 재검수 통과 · 길이·자막 시각 그대로`;
    // 청취 확인용 전후 4초 (본편 끝 −3.5초 ~ +0.5초)
    for (const [tag, f] of [["before", masterFile], ["after", newMaster]] as const) {
      const pv = path.join(dir, `${tag}.m4a`);
      await ffmpeg(["-ss", ((bodyEnd / RATE) - 3.5).toFixed(3), "-t", "4", "-i", f, "-c:a", "aac", "-b:a", "192k", pv]);
      await s.put(`datasets/pilot/tail-fix/${ep.id}-${tag}.m4a`, await fs.readFile(pv), "audio/mp4");
    }
    if (apply) {
      for (const k of ["master.wav", "dist.m4a", "lossless.flac"]) await s.put(`episodes/${ep.id}/audio/pre-tailfix/${k}`, await s.get(`episodes/${ep.id}/audio/${k}`), k.endsWith(".wav") ? "audio/wav" : k.endsWith(".flac") ? "audio/flac" : "audio/mp4");
      await s.put(`episodes/${ep.id}/audio/master.wav`, await fs.readFile(newMaster), "audio/wav");
      await s.put(`episodes/${ep.id}/audio/dist.m4a`, await fs.readFile(distOut), "audio/mp4");
      await s.put(`episodes/${ep.id}/audio/lossless.flac`, await fs.readFile(losslessOut), "audio/flac");
      await insertRun({ backlog_id: ep.backlog_id, phase: "tts", result: `${note} · 옛 파일 audio/pre-tailfix/ · 앱 반영은 콘솔 재발행`, prompt_version: "tts-v1 (tail-fix)", artifacts: [`s3:episodes/${ep.id}/audio/master.wav`, `s3:episodes/${ep.id}/audio/dist.m4a`, `s3:episodes/${ep.id}/audio/lossless.flac`], executed_by: executedBy, worker_rev: workerRev() });
    }
    fixed++;
    console.log(`${ep.id} ${apply ? "수리·반입" : "수리 가능"} — ${note}`);
  } catch (e: any) {
    failed++;
    console.log(`${ep.id} 실패 — ${String(e?.message ?? e).slice(0, 200)}`);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
await fs.rm(work, { recursive: true, force: true });
await pool.end();
console.log(`\n수리 ${fixed}편 · 남은 덧말 없음 ${clean}편 · 실패 ${failed}편 · 전후 4초 datasets/pilot/tail-fix/${apply ? " · 콘솔 발행 화면에서 재발행" : " · --apply 로 반입"}`);
