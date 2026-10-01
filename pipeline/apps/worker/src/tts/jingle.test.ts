import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
process.env.DATABASE_URL ??= "postgres://test";
const { assemble, probeTrailingSilenceSec } = await import("./audio.js");
const run = promisify(execFile);
const hasFfmpeg = await run("ffmpeg", ["-version"]).then(() => true, () => false);

// 징글 (2026-10-01): 인트로는 맨 앞, 아웃트로는 맨 뒤에 인트로 징글의 여백(끝 무음)만큼 패딩을 두고 붙는다. 로컬 ffmpeg 가 있을 때만 (CI 는 워커 테스트를 돌리지 않는다)
test("징글 조립 — 인트로 끝 무음을 재서 아웃트로 앞 패딩으로 쓰고, 길이와 오프셋을 돌려준다", { skip: !hasFfmpeg && "ffmpeg 없음" }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jingle-"));
  const tone = (sec: number) => `sine=frequency=440:sample_rate=44100:duration=${sec}`;
  const intro = path.join(dir, "intro.mp3"), outro = path.join(dir, "outro.mp3"), seg = path.join(dir, "seg.pcm");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-f", "lavfi", "-i", tone(1), "-filter_complex", "[0:a]atrim=0:0.8[s];[1:a][s]concat=n=2:v=0:a=1[o]", "-map", "[o]", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", intro]);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", tone(1), "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", outro]);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", tone(1), "-f", "s16le", "-ac", "1", "-ar", "44100", seg]);
  const pad = await probeTrailingSilenceSec(intro);
  assert.ok(pad > 0.6 && pad < 1.0, `인트로 끝 무음 ${pad}`);
  const r = await assemble({ segments: [{ data: await fs.readFile(seg), format: "pcm_44100" }], gapSec: [], workDir: dir, masterOut: path.join(dir, "m.wav"), distOut: path.join(dir, "d.mp3"), introFile: intro, outroFile: outro });
  assert.ok(r.introSec > 1.6 && r.introSec < 2.0, `인트로 ${r.introSec}`);
  assert.ok(Math.abs(r.outroPadSec - pad) < 0.01, `패딩 ${r.outroPadSec}`);
  // 인트로 1.8 + 앞 2 + 세그먼트 1 + 뒤 2 + 패딩 0.8 + 아웃트로 1 ≈ 8.6
  assert.ok(r.durationSec > 8.2 && r.durationSec < 9.2, `전체 ${r.durationSec}`);
  const plain = await assemble({ segments: [{ data: await fs.readFile(seg), format: "pcm_44100" }], gapSec: [], workDir: dir, masterOut: path.join(dir, "m2.wav"), distOut: path.join(dir, "d2.mp3") });
  assert.equal(plain.introSec, 0); assert.equal(plain.outroPadSec, 0);
  await fs.rm(dir, { recursive: true, force: true });
});
