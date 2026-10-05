import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 오디오 조립 (spec/06 7장) — ffmpeg 로: 본편[앞 무음 → 세그먼트 디코드·연결(문맥 겹침 경계는 그대로, 폴백 경계는 자연 쉼 길이의 무음) → 뒤 무음]
 * → 본편만 라우드니스 정규화(2패스 linear, -16 LUFS) → 스테레오(목소리는 양쪽 같게) → [인트로 | 본편 | 아웃트로] 연결
 * → 마스터 wav(스테레오) + 배포본 mp3 192kbps (2026-09-22: ElevenLabs 원본이 mp3 128k 라 배포본을 128k 로 다시 인코딩하면 손실을 두 번 거친다 —
 *   192k 는 그 두 번째 열화를 거의 없앤다. 원본이 pcm 이 되면(Pro 플랜) 다시 정한다). 재처리는 항상 마스터에서.
 * 징글은 업로드 때 한 번 음량·포맷을 맞춰 두고(cli/jingle.ts) 조립 때는 손대지 않는다 — 2026-10-05 KAN-122: 모노 합치기가 넓은 스테레오 징글의
 * 사이드 성분을 지웠고, 전체 1패스 loudnorm 이 조용한 징글을 +7~12dB 끌어올려 리미터·동적 게인으로 눌렀다.
 * ffmpeg 는 워커 이미지(deploy/Dockerfile)에 포함 — 로컬 실행 시엔 brew install ffmpeg.
 */
const run = promisify(execFile);

async function ffmpeg(args: string[]) {
  try { await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]); }
  catch (e: any) {
    if (e.code === "ENOENT") throw new Error("ffmpeg 가 없습니다 — 서버 이미지에는 포함, 로컬은 brew install ffmpeg");
    throw new Error(`ffmpeg 실패: ${(e.stderr || e.message || "").slice(0, 500)}`);
  }
}

/**
 * 20ms RMS(dB) 궤적에서 "조용한 구간" 중 가장 긴 것 — 문턱은 창 안 최저값 + marginDb (절대 상한 capDb).
 * 턴 사이 쉼의 바닥은 요청·구간마다 −90~−35dB 로 크게 달라(X260919-001 샘플 실측) 고정 문턱은 못 쓴다. 순수 함수 — 테스트용으로 분리.
 */
export function longestQuietRun(db: number[], hopSec: number, minSec: number, opts: { marginDb?: number; capDb?: number; maxStartSec?: number } = {}): { start: number; end: number } | null {
  const { marginDb = 12, capDb = -35, maxStartSec = Infinity } = opts;
  const real = db.filter((x) => x > -100); // 디코더 프라이밍의 디지털 0 프레임(−120dB)은 바닥이 아니다 — 끼면 문턱이 −108dB 가 되어 아무것도 안 잡힌다
  if (!real.length) return null;
  const floor = Math.min(...real);
  const th = Math.min(floor + marginDb, capDb);
  let best: [number, number] | null = null;
  for (let i = 0; i < db.length; ) {
    if (db[i] > th) { i++; continue; }
    let j = i; while (j < db.length && db[j] <= th) j++;
    // maxStartSec 뒤에 시작하는 구간(뒤 턴 첫 낱말 뒤의 쉼표 쉼 등)은 후보가 아니다 — 거기서 자르면 뒤 턴의 첫 낱말이 잘려 나간다
    if (i * hopSec <= maxStartSec && (!best || j - i > best[1] - best[0])) best = [i, j];
    i = j;
  }
  if (!best || (best[1] - best[0]) * hopSec < minSec) return null;
  return { start: best[0] * hopSec, end: best[1] * hopSec };
}

/**
 * 창 앞에서부터 처음 나오는 조용한 구간(minSec 이상) — 끝 꼬리용 (2026-10-01). 문턱은 longestQuietRun 과 같다(창 바닥 + marginDb, 상한 capDb).
 * 끝 꼬리는 뒤에 버릴 덧말(가드)만 있으므로 "가장 긴" 구간이 아니라 마지막 낱말 직후의 첫 쉼이 필요하다. 문장 끝 "다." 뒤 턴 사이 쉼은 0.5초 이상이고
 * 낱말 안의 폐쇄음 정지는 0.1초 미만이라 minSec 0.15초면 섞이지 않는다. 순수 함수 — 테스트용으로 분리.
 */
export function firstQuietRun(db: number[], hopSec: number, minSec: number, opts: { marginDb?: number; capDb?: number } = {}): { start: number; end: number } | null {
  const { marginDb = 12, capDb = -35 } = opts;
  const real = db.filter((x) => x > -100);
  if (!real.length) return null;
  const th = Math.min(Math.min(...real) + marginDb, capDb);
  for (let i = 0; i < db.length; ) {
    if (db[i] > th) { i++; continue; }
    let j = i; while (j < db.length && db[j] <= th) j++;
    if ((j - i) * hopSec >= minSec) return { start: i * hopSec, end: j * hopSec };
    i = j;
  }
  return null;
}

/**
 * 끝 꼬리 절단점 (2026-10-01 박수헌 "마지막 말이 끝나자마자 뚝 끊긴다"): ElevenLabs 출력은 요청의 마지막 음절 뒤 약 20ms 만에 −20dB 에서 0 으로 끊긴다(spec/06 7장).
 * 마지막 요청 끝에 버릴 덧말(가드)을 붙여 생성하면 마지막 낱말이 자연스럽게 감쇠하고 쉼이 생긴다 — [마지막 턴 마지막 글자 시작 −0.2초, 가드 첫 글자 시작 +1.5초]
 * 창에서 첫 쉼을 찾아, 쉼 시작 뒤 keepSec 만큼(감쇠 끝과 바닥 일부)만 남기고 자른다. 없으면 null.
 */
export async function findTailCut(file: string, from: number, to: number, minSec = 0.15, keepSec = 0.1): Promise<number | null> {
  if (!(to > from)) return null;
  const { stdout } = await run("ffmpeg", ["-v", "error", "-ss", Math.max(0, from).toFixed(3), "-to", to.toFixed(3), "-i", file, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], { encoding: "buffer", maxBuffer: 1 << 26 });
  const buf = stdout as unknown as Buffer;
  const win = 882;
  const db: number[] = [];
  for (let i = 0; i + win <= buf.length / 2; i += win) { let acc = 0; for (let k = 0; k < win; k++) { const v = buf.readInt16LE((i + k) * 2) / 32768; acc += v * v; } db.push(10 * Math.log10(acc / win + 1e-12)); }
  const q = firstQuietRun(db, 0.02, minSec);
  return q ? Math.max(0, from) + q.start + Math.min(keepSec, (q.end - q.start) / 2) : null;
}

/** s16le mono PCM 끝에 선형 페이드아웃 — 절단점의 딸깍임·뚝 끊김을 지운다. 새 버퍼를 돌려준다 */
export function fadeOutPcm(buf: Buffer, sec: number, rate = 44100): Buffer {
  const out = Buffer.from(buf);
  const total = Math.floor(out.length / 2);
  const n = Math.min(total, Math.round(sec * rate));
  for (let k = 0; k < n; k++) {
    const idx = total - n + k;
    out.writeInt16LE(Math.round(out.readInt16LE(idx * 2) * (1 - (k + 1) / n)), idx * 2);
  }
  return out;
}

/**
 * [from, to] 창 안에서 가장 긴 조용한 구간의 한가운데 시각 — 문맥 겹침 절단점 (2026-09-22 KAN-87).
 * 정렬 타임스탬프는 쉼을 글자 길이에 흡수하는데 그 위치가 일정하지 않아(앞 턴 마침표·뒤 턴 첫 글자·그 뒤 글자들) 경계 글자만으로 잡은 창은
 * 0.16초처럼 좁아 실패했다(샘플 실측). 창은 [앞 턴 마지막 글자 시작 −0.2초, 뒤 턴 첫 글자 시작 +1.5초]로 넓게 잡고, 조용한 구간 중
 * **창 시작 후 `maxStartSec`(기본 1.2초) 안에 시작하는 가장 긴 것**을 고른다 — 앞 턴 마지막 낱말은 1.2초를 넘지 않으므로 그 안에 시작하는
 * 긴 쉼이 곧 턴 사이 쉼이고, 뒤 턴 첫 낱말 뒤의 쉼표 쉼은 그보다 늦게 시작한다. 정렬의 "뒤 턴 첫 글자 시작"은 실제 발화보다 1.4초까지
 * 앞설 수 있어(쉼이 그 글자에 흡수) 기준으로 못 쓴다. 문맥 턴 안의 쉼표 쉼은 창 시작이 그 턴의 마지막 글자라 창에 없다. 없으면 null.
 */
export async function findPauseCut(file: string, from: number, to: number, maxStartSec = 1.2, minSec = 0.08): Promise<number | null> {
  if (!(to > from)) return null;
  const { stdout } = await run("ffmpeg", ["-v", "error", "-ss", from.toFixed(3), "-to", to.toFixed(3), "-i", file, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], { encoding: "buffer", maxBuffer: 1 << 26 });
  const buf = stdout as unknown as Buffer;
  const win = 882; // 20ms @ 44.1kHz
  const db: number[] = [];
  for (let i = 0; i + win <= buf.length / 2; i += win) { let acc = 0; for (let k = 0; k < win; k++) { const v = buf.readInt16LE((i + k) * 2) / 32768; acc += v * v; } db.push(10 * Math.log10(acc / win + 1e-12)); }
  const q = longestQuietRun(db, 0.02, minSec, { maxStartSec });
  return q ? from + (q.start + q.end) / 2 : null;
}

/** 파일 앞머리 무음 길이(초) — 징글(인트로)의 앞 여백을 재서 아웃트로 앞 패딩으로 쓴다 (2026-10-01 박수헌: "아웃트로 앞에 패딩이 인트로만큼"). 무음이 0초에서 시작하지 않으면 0 */
export async function probeLeadingSilenceSec(file: string, thresholdDb = -45, minSec = 0.05): Promise<number> {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", file, "-af", `silencedetect=n=${thresholdDb}dB:d=${minSec}`, "-f", "null", "-"]);
  const start = stderr.match(/silence_start: ([\d.]+)/)?.[1];
  const end = stderr.match(/silence_end: ([\d.]+)/)?.[1];
  if (start == null || end == null || Number(start) > 0.05) return 0;
  return Math.round(Number(end) * 1000) / 1000;
}

/** 파일 끝 무음 길이(초) — 인트로 징글은 소리 뒤에 여백이 들어 있다(실파일: 4초 중 끝 1.05초). 아웃트로 앞 패딩을 이 길이로 맞춘다. 끝까지 이어지는 무음이 없으면 0 */
export async function probeTrailingSilenceSec(file: string, thresholdDb = -45, minSec = 0.05): Promise<number> {
  const dur = await probeDurationSec(file);
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", file, "-af", `silencedetect=n=${thresholdDb}dB:d=${minSec}`, "-f", "null", "-"]);
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  if (!starts.length) return 0;
  const lastStart = starts[starts.length - 1];
  const lastEnd = ends.length >= starts.length ? ends[ends.length - 1] : dur; // 파일 끝까지 무음이면 silence_end 가 안 찍히기도 한다
  if (dur - lastEnd > 0.05) return 0;
  return Math.round((dur - lastStart) * 1000) / 1000;
}

/** 외부 오디오 파일(mp3/wav 등) → 표준 wav (44.1kHz s16le, 채널 수 지정 — 징글은 2). 포맷만 바꾸고 음량은 건드리지 않는다 */
export async function fileToWav(src: string, outFile: string, channels: 1 | 2 = 1): Promise<string> {
  await ffmpeg(["-i", src, "-ar", "44100", "-ac", String(channels), "-c:a", "pcm_s16le", outFile]);
  return outFile;
}

/** EBU R128 측정 (ebur128 필터 — 통합 라우드니스 LUFS · 트루 피크 dBTP). loudnorm 1패스 측정은 수 초짜리 짧은 파일(징글)에서 1~1.5dB 어긋나 짧은 파일은 이걸 쓴다 */
export async function measureEbur128(file: string): Promise<{ i: number; tp: number }> {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { maxBuffer: 1 << 26 });
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  return { i: Number(summary.match(/I:\s+(-?[\d.]+|-inf) LUFS/)?.[1]), tp: Number(summary.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/)?.[1]) };
}

/**
 * 짧은 파일(징글)의 음량 맞춤: ebur128 로 재고 고정 게인 한 번(volume) — 선형이다. 목표까지 올리면 트루 피크가 tp 를 넘는 경우 피크 여유만큼만 올린다.
 * 출력은 44.1kHz s16, 채널 수 지정(징글은 2 — 원래 스테레오 그대로).
 */
export async function levelToTarget(src: string, outFile: string, o: { targetI: number; tp?: number; channels: 1 | 2 }): Promise<{ targetI: number; requestedI: number; gainDb: number; measuredI: number; measuredTp: number; outputI: number; outputTp: number }> {
  const tp = o.tp ?? -1.5;
  const m = await measureEbur128(src);
  if (!Number.isFinite(m.i) || !Number.isFinite(m.tp)) throw new Error(`음량을 못 쟀다(무음?): ${src}`);
  const gainDb = Math.round(Math.min(o.targetI - m.i, tp - 0.1 - m.tp) * 100) / 100;
  await ffmpeg(["-i", src, "-af", `volume=${gainDb}dB`, "-ar", "44100", "-ac", String(o.channels), "-c:a", "pcm_s16le", outFile]);
  const out = await measureEbur128(outFile);
  return { targetI: Math.round((m.i + gainDb) * 100) / 100, requestedI: o.targetI, gainDb, measuredI: m.i, measuredTp: m.tp, outputI: out.i, outputTp: out.tp };
}

/** 모노 wav → 스테레오 wav (두 채널에 같은 신호, 감쇠 없음) */
async function monoToStereo(src: string, outFile: string): Promise<string> {
  await ffmpeg(["-i", src, "-af", "pan=stereo|c0=c0|c1=c0", "-ar", "44100", "-c:a", "pcm_s16le", outFile]);
  return outFile;
}

/** loudnorm print_format=json 의 마지막 JSON 블록을 읽는다 (ffmpeg 는 stderr 에 찍는다) */
async function loudnormJson(args: string[]): Promise<Record<string, string>> {
  let stderr = "";
  try { stderr = (await run("ffmpeg", ["-hide_banner", "-nostats", ...args], { maxBuffer: 1 << 24 })).stderr; }
  catch (e: any) {
    if (e.code === "ENOENT") throw new Error("ffmpeg 가 없습니다 — 서버 이미지에는 포함, 로컬은 brew install ffmpeg");
    throw new Error(`ffmpeg 실패: ${(e.stderr || e.message || "").slice(0, 500)}`);
  }
  const a = stderr.lastIndexOf("{"), b = stderr.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error(`loudnorm 측정값을 못 읽었다: ${stderr.slice(-300)}`);
  return JSON.parse(stderr.slice(a, b + 1)) as Record<string, string>;
}

export interface LoudnessResult {
  type: string;          // "linear" | "dynamic"(선형이 성립하지 않아 ffmpeg 가 바꾼 경우 — 경고 대상) | "skipped"(무음에 가까워 측정 불가)
  targetI: number;       // 실제로 쓴 목표 (피크 여유가 없으면 요청 목표보다 낮춘다)
  requestedI: number;
  measuredI: number; measuredTp: number; measuredLra: number;
  outputI: number; outputTp: number;
}

/**
 * 2패스 라우드니스 정규화 (2026-10-05 KAN-122): 1패스로 재고, 2패스에 측정값을 넘겨 linear=true — 파일 전체에 고정 게인 한 번.
 * 1패스(동적) loudnorm 은 읽으면서 게인을 계속 바꿔 말소리가 출렁이고 쉼 뒤 바닥이 들뜬다. 고정 게인으로 목표에 닿으면 최대 피크가 TP 를 넘는 경우엔
 * ffmpeg 가 몰래 동적 모드로 바꾸므로, 그때는 목표를 피크 여유만큼 낮춰 선형을 지킨다(결과에 남긴다 — 리미터로 누르지 않는다).
 */
export async function normalizeLinear(src: string, outFile: string, o: { targetI: number; tp?: number; lra?: number; channels: 1 | 2 }): Promise<LoudnessResult> {
  const tp = o.tp ?? -1.5;
  const p1 = await loudnormJson(["-i", src, "-af", `loudnorm=I=${o.targetI}:TP=${tp}:LRA=${o.lra ?? 11}:print_format=json`, "-f", "null", "-"]);
  const mi = Number(p1.input_i), mtp = Number(p1.input_tp), mlra = Number(p1.input_lra), mth = Number(p1.input_thresh);
  if (![mi, mtp, mlra, mth].every(Number.isFinite) || mi <= -69) {
    await ffmpeg(["-i", src, "-ar", "44100", "-ac", String(o.channels), "-c:a", "pcm_s16le", outFile]);
    return { type: "skipped", targetI: o.targetI, requestedI: o.targetI, measuredI: mi, measuredTp: mtp, measuredLra: mlra, outputI: mi, outputTp: mtp };
  }
  const headroom = tp - 0.1 - mtp; // 고정 게인으로 올릴 수 있는 최대치
  const targetI = Math.round(Math.min(o.targetI, mi + headroom) * 100) / 100;
  const lra = Math.min(20, Math.max(o.lra ?? 11, Math.ceil(mlra) + 1)); // 측정 LRA 보다 작은 목표는 선형을 막는다
  const f = `loudnorm=I=${targetI}:TP=${tp}:LRA=${lra}:linear=true:measured_I=${mi}:measured_TP=${mtp}:measured_LRA=${mlra}:measured_thresh=${mth}:offset=${Number(p1.target_offset) || 0}:print_format=json`;
  const p2 = await loudnormJson(["-y", "-i", src, "-af", f, "-ar", "44100", "-ac", String(o.channels), "-c:a", "pcm_s16le", outFile]);
  return { type: p2.normalization_type ?? "?", targetI, requestedI: o.targetI, measuredI: mi, measuredTp: mtp, measuredLra: mlra, outputI: Number(p2.output_i), outputTp: Number(p2.output_tp) };
}

export async function probeDurationSec(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim()) || 0;
}

import type { AudioFormat } from "./elevenlabs.js";
import { DEFAULT_GAP_SEC } from "./segments.js";

export interface Segment { data: Buffer; format: AudioFormat }

/** 세그먼트 버퍼 → 표준 wav 파일 (44.1kHz mono s16le) */
export async function segmentToWav(seg: Segment, outFile: string, tmpDir: string): Promise<string> {
  await fs.mkdir(tmpDir, { recursive: true });
  return toWav(seg, outFile, tmpDir, Math.floor(Math.random() * 1e6));
}

async function toWav(seg: Segment, outFile: string, tmpDir: string, n: number): Promise<string> {
  const src = path.join(tmpDir, `seg-${n}.${seg.format === "pcm_44100" ? "pcm" : seg.format.startsWith("wav") ? "wav" : "mp3"}`); // mp3 는 비트레이트 무관 동일 디코드 · wav 는 헤더로 읽는다
  await fs.writeFile(src, seg.data);
  const inputArgs = seg.format === "pcm_44100" ? ["-f", "s16le", "-ar", "44100", "-ac", "1", "-i", src] : ["-i", src];
  await ffmpeg([...inputArgs, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", outFile]);
  return outFile;
}

async function silenceWav(sec: number, outFile: string, channels: 1 | 2 = 1): Promise<string> {
  await ffmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=${channels === 2 ? "stereo" : "mono"}`, "-t", String(sec), "-c:a", "pcm_s16le", outFile]);
  return outFile;
}

async function concatWavs(parts: string[], outFile: string, tmp: string, name: string): Promise<string> {
  const listFile = path.join(tmp, `${name}.txt`);
  await fs.writeFile(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c:a", "pcm_s16le", outFile]);
  return outFile;
}

/**
 * 한 요청의 오디오를 턴 경계로 잘라 구간별 배속(atempo)을 적용하고 다시 이어 붙인다 (spec/06 6장 화자별 배속).
 * pieces 는 시각 순서·연속 구간 — 마지막 조각은 end 없이 파일 끝까지. tempo 1 인 조각은 원본 그대로.
 * 결과는 s16le 44.1kHz mono 원시 PCM 버퍼 (Segment.format = "pcm_44100").
 */
export async function retimePieces(srcFile: string, pieces: { start: number; end?: number; tempo: number }[], tmpDir: string): Promise<Buffer> {
  await fs.mkdir(tmpDir, { recursive: true });
  const out = path.join(tmpDir, `retime-${Date.now()}.pcm`);
  const chains = pieces.map((pc, n) => {
    const trim = pc.end != null ? `atrim=start=${pc.start.toFixed(3)}:end=${pc.end.toFixed(3)}` : `atrim=start=${pc.start.toFixed(3)}`;
    const tempo = Math.abs(pc.tempo - 1) < 0.001 ? "" : `,atempo=${pc.tempo.toFixed(3)}`;
    return `[0:a]${trim},asetpts=PTS-STARTPTS${tempo}[p${n}]`;
  });
  const concat = `${pieces.map((_, n) => `[p${n}]`).join("")}concat=n=${pieces.length}:v=0:a=1[out]`;
  await ffmpeg(["-i", srcFile, "-filter_complex", [...chains, concat].join(";"), "-map", "[out]", "-f", "s16le", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
  const buf = await fs.readFile(out);
  await fs.rm(out, { force: true });
  return buf;
}

export interface AssemblePiece { kind: "segment"; segment: Segment } // 순서대로 연결, 사이에 gapSec 무음
export interface AssembleInput {
  segments: Segment[];
  gapSec?: number | number[]; // 세그먼트(분할 요청) 사이 무음 — 배열이면 경계별. 문맥 겹침 경계(spec/06 7장 ④)는 0(양쪽 반쪽 쉼이 오디오에 이미 있다), 폴백 경계는 DEFAULT_GAP_SEC
  leadSec?: number;      // 시작 무음 (기본 2초 — 2026-09-07 박수헌: 재생 시작 직후 첫 음절이 잘리지 않게)
  tailSec?: number;      // 끝 무음 (기본 2초 — 다음 콘텐츠·종료 전 여백)
  /** 징글 (2026-10-01 박수헌 확정): 징글 파일 자체가 앞뒤 무음 1초를 갖도록 정규화돼 있고(cli/jingle.ts), 본편 앞뒤에 **바로** 붙인다 —
   *  [1초][인트로][1초][본편][1초][아웃트로][1초]. 그래서 징글이 붙는 쪽은 leadSec/tailSec 무음을 넣지 않는다(징글이 없는 쪽만 기본 2초). 파일은 S3 datasets/channel-audio/ 에서 받은 로컬 경로.
   *  음량은 업로드 때 맞춰 두었으므로 조립은 포맷(44.1kHz 스테레오)만 바꾸고 원래 스테레오 그대로 붙인다 (2026-10-05 KAN-122) */
  introFile?: string | null;
  outroFile?: string | null;
  outroPadSec?: number;  // 아웃트로 앞 추가 무음 — 기본 0 (파일에 이미 1초가 있다). 필요하면 TTS_OUTRO_PAD_SEC 로
  workDir: string;       // 임시 파일 디렉토리 (episodes/{id}/audio/)
  masterOut: string;     // master.wav 경로
  distOut: string;       // dist.mp3 경로
}

/** 본편 라우드니스 목표 (spec/06 7장) — 징글은 여기에 넣지 않는다. 모노로 잰 값이다: 양쪽 같은 스테레오로 바꾸면 BS.1770 측정이 +3dB 라
 *  배포본(스테레오)에서는 -13 LUFS 로 잰다. 이전 모노 배포본도 플레이어가 양쪽으로 내보내 같은 크기로 들렸다 — 청취 음량은 바뀌지 않는다 (2026-10-05) */
export const VOICE_TARGET_LUFS = -16;
export const VOICE_TARGET_TP = -1.5;
/** 배포본(스테레오)에서 본편의 라우드니스 = 모노 목표 + 3 */
export const VOICE_STEREO_LUFS = VOICE_TARGET_LUFS + 3;
/** 징글 목표 (스테레오로 잰 값) — 본편보다 2LU 작게 (KAN-122 "본편보다 크지 않게") */
export const JINGLE_TARGET_LUFS = VOICE_STEREO_LUFS - 2;

/**
 * 전체 조립: 본편[앞 무음(징글 없을 때 2초) → 디코드·연결 → 뒤 무음(징글 없을 때 2초)] → 본편만 2패스 linear 정규화 → 스테레오
 * → [인트로 | 본편 | 아웃트로] 연결 = 마스터 wav → mp3 배포본. 반환: 재생 길이(초)·본편 시작 오프셋(초 — 자막 시각의 앞 오프셋)·정규화 결과
 */
export async function assemble(i: AssembleInput): Promise<{ durationSec: number; introSec: number; leadSec: number; outroPadSec: number; loudness: LoudnessResult }> {
  const tmp = path.join(i.workDir, ".tmp");
  await fs.mkdir(tmp, { recursive: true });
  // 1) 본편 (모노 — ElevenLabs 출력은 모노다)
  const voice: string[] = [];
  const leadSec = i.leadSec ?? (i.introFile ? 0 : 2); // 인트로가 있으면 그 파일의 끝 1초가 여백이다
  if (leadSec > 0) voice.push(await silenceWav(leadSec, path.join(tmp, "lead.wav")));
  const gapAt = (n: number) => (Array.isArray(i.gapSec) ? i.gapSec[n - 1] ?? 0 : i.gapSec ?? DEFAULT_GAP_SEC);
  for (let n = 0; n < i.segments.length; n++) {
    if (n > 0 && gapAt(n) > 0) voice.push(await silenceWav(gapAt(n), path.join(tmp, `gap-${n}.wav`)));
    voice.push(await toWav(i.segments[n], path.join(tmp, `part-${n}.wav`), tmp, n));
  }
  const tailSec = i.tailSec ?? (i.outroFile ? 0 : 2); // 아웃트로가 있으면 그 파일의 앞 1초가 여백이다
  if (tailSec > 0) voice.push(await silenceWav(tailSec, path.join(tmp, "tail.wav")));
  const voiceRaw = await concatWavs(voice, path.join(tmp, "voice.wav"), tmp, "voice");
  // 2) 본편만 정규화 (앞뒤 무음은 게이트에 걸려 측정에 들어가지 않는다) → 스테레오
  const loudness = await normalizeLinear(voiceRaw, path.join(tmp, "voice.norm.wav"), { targetI: VOICE_TARGET_LUFS, tp: VOICE_TARGET_TP, channels: 1 });
  const voiceSt = await monoToStereo(path.join(tmp, "voice.norm.wav"), path.join(tmp, "voice.st.wav"));
  // 3) 징글은 포맷만 맞춰 그대로 (스테레오 유지, 음량 처리 없음)
  const parts: string[] = [];
  let introSec = 0;
  if (i.introFile) { const w = await fileToWav(i.introFile, path.join(tmp, "intro.wav"), 2); introSec = await probeDurationSec(w); parts.push(w); }
  parts.push(voiceSt);
  const outroPadSec = i.outroFile ? i.outroPadSec ?? 0 : 0;
  if (i.outroFile) {
    if (outroPadSec > 0) parts.push(await silenceWav(outroPadSec, path.join(tmp, "outro-pad.wav"), 2));
    parts.push(await fileToWav(i.outroFile, path.join(tmp, "outro.wav"), 2));
  }
  await concatWavs(parts, i.masterOut, tmp, "master");
  await ffmpeg(["-i", i.masterOut, "-c:a", "libmp3lame", "-b:a", "192k", i.distOut]); // 128k → 192k (2026-09-22 박수헌). 스테레오는 joint stereo 라 목소리(양쪽 같음)는 비트를 거의 더 쓰지 않는다
  const dur = await probeDurationSec(i.distOut);
  await fs.rm(tmp, { recursive: true, force: true });
  return { durationSec: dur, introSec: Math.round(introSec * 1000) / 1000, leadSec, outroPadSec, loudness };
}

/** mp3 버퍼를 파일로 저장 (개별 세그먼트 보관용) */
export async function writeBuf(file: string, data: Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}
