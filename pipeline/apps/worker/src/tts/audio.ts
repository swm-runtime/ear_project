import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 오디오 조립 (spec/06 7장) — ffmpeg 로: 앞 무음(2초) → 세그먼트 디코드·연결(문맥 겹침 경계는 그대로, 폴백 경계는 자연 쉼 길이의 무음) → 뒤 무음(2초) → 라우드니스 정규화(-16 LUFS)
 * → 마스터 wav + 배포본 mp3 192kbps (2026-09-22: ElevenLabs 원본이 mp3 128k 라 배포본을 128k 로 다시 인코딩하면 손실을 두 번 거친다 —
 *   192k 는 그 두 번째 열화를 거의 없앤다. 원본이 pcm 이 되면(Pro 플랜) 다시 정한다). 재처리는 항상 마스터에서.
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

/** 외부 오디오 파일(mp3/wav 등) → 표준 wav (44.1kHz mono s16le) */
export async function fileToWav(src: string, outFile: string): Promise<string> {
  await ffmpeg(["-i", src, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", outFile]);
  return outFile;
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
  const src = path.join(tmpDir, `seg-${n}.${seg.format === "pcm_44100" ? "pcm" : "mp3"}`); // mp3 는 비트레이트 무관 동일 디코드
  await fs.writeFile(src, seg.data);
  const inputArgs = seg.format === "pcm_44100" ? ["-f", "s16le", "-ar", "44100", "-ac", "1", "-i", src] : ["-i", src];
  await ffmpeg([...inputArgs, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", outFile]);
  return outFile;
}

async function silenceWav(sec: number, outFile: string): Promise<string> {
  await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(sec), "-c:a", "pcm_s16le", outFile]);
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
  /** 징글 (2026-10-01 박수헌 확정): 징글 파일 자체가 앞뒤 무음 1초를 갖도록 정규화돼 있고(.work/upload-jingle.mts), 본편 앞뒤에 **바로** 붙인다 —
   *  [1초][인트로][1초][본편][1초][아웃트로][1초]. 그래서 징글이 붙는 쪽은 leadSec/tailSec 무음을 넣지 않는다(징글이 없는 쪽만 기본 2초). 파일은 S3 assets/audio/ 에서 받은 로컬 경로 */
  introFile?: string | null;
  outroFile?: string | null;
  outroPadSec?: number;  // 아웃트로 앞 추가 무음 — 기본 0 (파일에 이미 1초가 있다). 필요하면 TTS_OUTRO_PAD_SEC 로
  workDir: string;       // 임시 파일 디렉토리 (episodes/{id}/audio/)
  masterOut: string;     // master.wav 경로
  distOut: string;       // dist.mp3 경로
}

/** 전체 조립: [인트로 | 앞 무음 2초] → 디코드·연결 → [아웃트로 | 뒤 무음 2초] → loudnorm 마스터 → mp3 배포본. 반환: 재생 길이(초)와 본편 시작 오프셋(초 — 자막 시각의 앞 오프셋) */
export async function assemble(i: AssembleInput): Promise<{ durationSec: number; introSec: number; leadSec: number; outroPadSec: number }> {
  const tmp = path.join(i.workDir, ".tmp");
  await fs.mkdir(tmp, { recursive: true });
  const parts: string[] = [];
  let introSec = 0;
  if (i.introFile) { const w = await fileToWav(i.introFile, path.join(tmp, "intro.wav")); introSec = await probeDurationSec(w); parts.push(w); }
  const leadSec = i.leadSec ?? (i.introFile ? 0 : 2); // 인트로가 있으면 그 파일의 끝 1초가 여백이다
  if (leadSec > 0) parts.push(await silenceWav(leadSec, path.join(tmp, "lead.wav")));
  const gapAt = (n: number) => (Array.isArray(i.gapSec) ? i.gapSec[n - 1] ?? 0 : i.gapSec ?? DEFAULT_GAP_SEC);
  for (let n = 0; n < i.segments.length; n++) {
    if (n > 0 && gapAt(n) > 0) parts.push(await silenceWav(gapAt(n), path.join(tmp, `gap-${n}.wav`)));
    parts.push(await toWav(i.segments[n], path.join(tmp, `part-${n}.wav`), tmp, n));
  }
  const tailSec = i.tailSec ?? (i.outroFile ? 0 : 2); // 아웃트로가 있으면 그 파일의 앞 1초가 여백이다
  if (tailSec > 0) parts.push(await silenceWav(tailSec, path.join(tmp, "tail.wav")));
  const outroPadSec = i.outroFile ? i.outroPadSec ?? 0 : 0;
  if (i.outroFile) {
    if (outroPadSec > 0) parts.push(await silenceWav(outroPadSec, path.join(tmp, "outro-pad.wav")));
    parts.push(await fileToWav(i.outroFile, path.join(tmp, "outro.wav")));
  }
  const listFile = path.join(tmp, "concat.txt");
  await fs.writeFile(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const joined = path.join(tmp, "joined.wav");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c:a", "pcm_s16le", joined]);
  // 라우드니스 정규화 → 마스터 (기준 -16 LUFS / TP -1.5 — 파일럿 기준값, spec/06 7장)
  await ffmpeg(["-i", joined, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", i.masterOut]);
  await ffmpeg(["-i", i.masterOut, "-c:a", "libmp3lame", "-b:a", "192k", i.distOut]); // 128k → 192k (2026-09-22 박수헌): 재인코딩 열화 최소화, 편당 약 17MB → 26MB
  const dur = await probeDurationSec(i.distOut);
  await fs.rm(tmp, { recursive: true, force: true });
  return { durationSec: dur, introSec: Math.round(introSec * 1000) / 1000, leadSec, outroPadSec };
}

/** mp3 버퍼를 파일로 저장 (개별 세그먼트 보관용) */
export async function writeBuf(file: string, data: Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}
