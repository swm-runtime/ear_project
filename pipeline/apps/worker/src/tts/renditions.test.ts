import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { encodeRenditions, probeDurationSec } from "./audio.js";

const run = promisify(execFile);
const pcm = async (f: string) => (await run("ffmpeg", ["-v", "error", "-i", f, "-f", "s16le", "-"], { encoding: "buffer", maxBuffer: 64 << 20 })).stdout as Buffer;

// 2026-10-06 음질 확정(KAN-141·142): 마스터에서 AAC 192k m4a(faststart) + 무손실 FLAC 을 한 번씩만 만든다
test("배포본 — m4a 는 AAC·moov 가 앞, FLAC 은 마스터와 샘플까지 같다, 길이는 같다", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rend-"));
  const master = path.join(dir, "master.wav"), dist = path.join(dir, "dist.m4a"), lossless = path.join(dir, "lossless.flac");
  await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=440:d=3", "-f", "lavfi", "-i", "sine=f=660:d=3", "-filter_complex", "[0][1]amerge=inputs=2", "-ar", "44100", "-c:a", "pcm_s16le", master]);
  await encodeRenditions(master, { distOut: dist, losslessOut: lossless });
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,channels", "-of", "default=nw=1", dist]);
  const info = Object.fromEntries(stdout.trim().split("\n").map((l) => l.split("=")));
  assert.equal(info.codec_name, "aac");
  assert.equal(info.channels, "2");
  const head = await fs.readFile(dist);
  assert.ok(head.indexOf("moov") < head.indexOf("mdat"), "moov 가 mdat 보다 앞이어야 한다");
  assert.ok((await pcm(lossless)).equals(await pcm(master)), "FLAC 은 무손실이어야 한다");
  const m = await probeDurationSec(master);
  assert.ok(Math.abs((await probeDurationSec(dist)) - m) < 0.1);
  assert.ok(Math.abs((await probeDurationSec(lossless)) - m) < 0.01);
  await assert.rejects(encodeRenditions(master, { distOut: path.join(dir, "x.ogg") }), /확장자/);
  await fs.rm(dir, { recursive: true, force: true });
});
