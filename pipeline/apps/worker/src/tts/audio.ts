import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 오디오 조립 (spec/06 7장) — ffmpeg 로: 세그먼트 디코드 → 무음 갭 삽입 연결 → 라우드니스 정규화(-16 LUFS)
 * → 마스터 wav(무손실) + 배포본 mp3 128kbps. 재처리는 항상 마스터에서.
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

export async function probeDurationSec(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim()) || 0;
}

import type { AudioFormat } from "./elevenlabs.js";

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

/** mp3 파일에서 [start,end) 구간 추출 → wav (콜드오픈 절단 — spec/06 7장 "본편 오디오에서 잘라 붙인다") */
export async function cutSegment(srcFile: string, startSec: number, endSec: number, outFile: string) {
  await ffmpeg(["-i", srcFile, "-ss", startSec.toFixed(3), "-to", endSec.toFixed(3), "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", outFile]);
}

export interface AssemblePiece { kind: "segment"; segment: Segment } // 순서대로 연결, 사이에 gapSec 무음
export interface AssembleInput {
  /** 콜드오픈 wav 파일 (이미 절단된 것) — 있으면 맨 앞 + 뒤에 긴 갭 */
  coldOpenWav?: string;
  segments: Segment[];
  gapSec?: number;       // 세그먼트(분할 요청) 사이 무음 — 요청 안의 턴 간격은 모델이 처리
  coldOpenGapSec?: number;
  workDir: string;       // 임시 파일 디렉토리 (episodes/{id}/audio/)
  masterOut: string;     // master.wav 경로
  distOut: string;       // dist.mp3 경로
}

/** 전체 조립: 디코드 → 연결 → loudnorm 마스터 → mp3 배포본. 반환: 재생 길이(초) */
export async function assemble(i: AssembleInput): Promise<number> {
  const tmp = path.join(i.workDir, ".tmp");
  await fs.mkdir(tmp, { recursive: true });
  const parts: string[] = [];
  if (i.coldOpenWav) {
    parts.push(i.coldOpenWav);
    parts.push(await silenceWav(i.coldOpenGapSec ?? 0.9, path.join(tmp, "gap-cold.wav")));
  }
  const gap = i.gapSec ?? 0.35;
  for (let n = 0; n < i.segments.length; n++) {
    if (n > 0) parts.push(await silenceWav(gap, path.join(tmp, `gap-${n}.wav`)));
    parts.push(await toWav(i.segments[n], path.join(tmp, `part-${n}.wav`), tmp, n));
  }
  const listFile = path.join(tmp, "concat.txt");
  await fs.writeFile(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const joined = path.join(tmp, "joined.wav");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c:a", "pcm_s16le", joined]);
  // 라우드니스 정규화 → 마스터 (기준 -16 LUFS / TP -1.5 — 파일럿 기준값, spec/06 7장)
  await ffmpeg(["-i", joined, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", i.masterOut]);
  await ffmpeg(["-i", i.masterOut, "-c:a", "libmp3lame", "-b:a", "128k", i.distOut]);
  const dur = await probeDurationSec(i.distOut);
  await fs.rm(tmp, { recursive: true, force: true });
  return dur;
}

/** mp3 버퍼를 파일로 저장 (콜드오픈 원본 턴 등 개별 보관용) */
export async function writeBuf(file: string, data: Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}
