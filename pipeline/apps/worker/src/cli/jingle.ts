import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cfg } from "../config.js";
import { storage } from "../storage.js";
import { levelToTarget, probeDurationSec, probeLeadingSilenceSec, probeTrailingSilenceSec, JINGLE_TARGET_LUFS, VOICE_STEREO_LUFS } from "../tts/audio.js";

/**
 * 채널 징글 정규화·업로드 (spec/06 7장 — 2026-10-01 박수헌 확정, 2026-10-05 KAN-122 음량·포맷 단계 추가)
 *   npm run jingle -- <인트로 원본> <아웃트로 원본> [--dry] [--fade-in=0.5] [--fade-out=1.0] [--target=-15]
 *       원본의 앞뒤 무음을 걷고 → 소리 구간에 페이드인·아웃 → 앞뒤 무음 1초 → ebur128 로 재서 고정 게인(선형)으로 목표 음량 → 44.1kHz 스테레오 s16 → S3 datasets/channel-audio/
 *   npm run jingle -- --relevel [--dry] [--target=-15]
 *       원본이 없을 때: S3 의 현재 징글(이미 다듬기·페이드·여백이 된 것)을 받아 음량·포맷만 다시 맞춘다. 올리기 전 현재 객체를 archive/ 에 남긴다
 * 조립(tts/audio.ts assemble)은 징글에 손대지 않는다 — 음량은 여기서 한 번만 맞춘다. 목표는 배포본에서 잰 본편(스테레오 -13 LUFS)보다 2LU 작게(기본 -15).
 * 측정은 ebur128 — loudnorm 1패스 측정은 5초 안팎의 징글에서 1.4dB 어긋났다(아웃트로: loudnorm -22.14 · ebur128 -20.7, 2026-10-05).
 * 스테레오는 그대로 둔다(모노로 합치면 넓은 징글의 사이드 성분이 지워진다 — KAN-122 실측 좌우 상관 0.18). --dry 면 로컬 파일만 만들고 올리지 않는다.
 */
const args = process.argv.slice(2);
const flag = (k: string, d: number) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d);
const dry = args.includes("--dry");
const relevel = args.includes("--relevel");
const PAD = 1, FADE_IN = flag("fade-in", 0.5), FADE_OUT = flag("fade-out", 1.0), TARGET = flag("target", JINGLE_TARGET_LUFS);
if (TARGET > VOICE_STEREO_LUFS) throw new Error(`징글 목표 ${TARGET} LUFS 가 배포본 본편(${VOICE_STEREO_LUFS})보다 크다 — 본편보다 작게 둔다 (KAN-122)`);
const ff = (a: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);
const KEYS = [cfg.ttsIntroKey || "datasets/channel-audio/intro.wav", cfg.ttsOutroKey || "datasets/channel-audio/outro.wav"];
const work = await fs.mkdtemp(path.join(os.tmpdir(), "jingle-"));
const sources = relevel ? [] : args.filter((a) => !a.startsWith("--"));
if (!relevel && sources.length !== 2) throw new Error("인트로·아웃트로 원본 경로 둘을 주거나 --relevel 을 쓴다");

for (const [n, key] of KEYS.entries()) {
  const name = path.basename(key, ".wav");
  let shaped: string;
  if (relevel) {
    shaped = path.join(work, `${name}.s3.wav`);
    await fs.writeFile(shaped, await storage().get(key));
  } else {
    const trimmed = path.join(work, `${name}.trim.wav`);
    shaped = path.join(work, `${name}.shaped.wav`);
    const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_duration=0";
    ff(["-i", sources[n], "-af", `${trim},areverse,${trim},areverse`, "-c:a", "pcm_s16le", trimmed]);
    const sound = await probeDurationSec(trimmed);
    const fade = `afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${Math.max(0, sound - FADE_OUT).toFixed(3)}:d=${FADE_OUT}`;
    ff(["-i", trimmed, "-af", `${fade},adelay=${PAD * 1000}:all=1,apad=pad_dur=${PAD}`, "-c:a", "pcm_s16le", shaped]);
  }
  const out = path.join(work, `${name}.wav`);
  const ln = await levelToTarget(shaped, out, { targetI: TARGET, channels: 2 });
  const dur = await probeDurationSec(out), lead = await probeLeadingSilenceSec(out), trail = await probeTrailingSilenceSec(out);
  if (!dry) {
    if (relevel) await storage().put(key.replace(/\/([^/]+)\.wav$/, `/archive/$1-${new Date().toISOString().slice(0, 10)}.wav`), await fs.readFile(shaped), "audio/wav");
    await storage().put(key, await fs.readFile(out), "audio/wav");
  }
  console.log(`${key} · ${relevel ? "재조정" : "원본 정규화"} · 음량 ${ln.measuredI} → ${ln.outputI} LUFS(게인 ${ln.gainDb}dB${ln.targetI < ln.requestedI - 0.05 ? ` — 피크 여유로 목표 ${ln.requestedI} 대신 ${ln.targetI}` : ""}) · TP ${ln.measuredTp} → ${ln.outputTp} · 44.1kHz 스테레오 · 전체 ${dur.toFixed(2)}초 · 앞 무음 ${lead}초 · 끝 무음 ${trail}초 · ${dry ? `미리보기(업로드 안 함) ${out}` : "업로드 완료"}`);
}
if (!dry) await fs.rm(work, { recursive: true, force: true });
