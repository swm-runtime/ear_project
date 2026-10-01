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

// 징글 (2026-10-01 확정): 징글 파일은 앞뒤 무음 1초로 정규화돼 있고 본편에 바로 붙는다 — 징글이 있는 쪽은 추가 무음(2초)을 넣지 않는다. 로컬 ffmpeg 가 있을 때만 (CI 는 워커 테스트를 돌리지 않는다)
test("징글 조립 — 정규화된 징글을 본편 앞뒤에 바로 붙이고, 본편 시작 오프셋을 돌려준다", { skip: !hasFfmpeg && "ffmpeg 없음" }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jingle-"));
  const ff = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  const jingle = path.join(dir, "jingle.wav"), seg = path.join(dir, "seg.pcm");
  // 앞 1초 무음 + 톤 1초 + 끝 1초 무음 = 3초
  await ff(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-af", "adelay=1000:all=1,apad=pad_dur=1", "-ac", "2", jingle]);
  await ff(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1", "-f", "s16le", "-ac", "1", "-ar", "44100", seg]);
  assert.ok(Math.abs((await probeTrailingSilenceSec(jingle)) - 1) < 0.1);
  const segment = { data: await fs.readFile(seg), format: "pcm_44100" as const };
  const r = await assemble({ segments: [segment], gapSec: [], workDir: dir, masterOut: path.join(dir, "m.wav"), distOut: path.join(dir, "d.mp3"), introFile: jingle, outroFile: jingle });
  assert.ok(Math.abs(r.introSec - 3) < 0.1, `인트로 ${r.introSec}`);
  assert.equal(r.leadSec, 0); assert.equal(r.outroPadSec, 0);
  assert.ok(r.durationSec > 6.8 && r.durationSec < 7.4, `전체 ${r.durationSec}`); // 인트로 3 + 본편 1 + 아웃트로 3
  const plain = await assemble({ segments: [segment], gapSec: [], workDir: dir, masterOut: path.join(dir, "m2.wav"), distOut: path.join(dir, "d2.mp3") });
  assert.equal(plain.introSec, 0); assert.equal(plain.leadSec, 2);
  assert.ok(plain.durationSec > 4.8 && plain.durationSec < 5.4, `징글 없음 ${plain.durationSec}`); // 앞 2 + 본편 1 + 뒤 2
  await fs.rm(dir, { recursive: true, force: true });
});
