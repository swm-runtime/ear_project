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
const channelsOf = async (f: string) => Number((await run("ffprobe", ["-v", "error", "-show_entries", "stream=channels", "-of", "csv=p=0", f])).stdout.trim());
const meanDb = async (f: string, from: number, dur: number) => {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(from), "-t", String(dur), "-i", f, "-af", "volumedetect", "-f", "null", "-"]);
  return Number(stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1]);
};

// 징글 (2026-10-01 확정): 징글 파일은 앞뒤 무음 1초로 정규화돼 있고 본편에 바로 붙는다 — 징글이 있는 쪽은 추가 무음(2초)을 넣지 않는다.
// KAN-122 (2026-10-05): 마스터·배포본은 스테레오, 징글은 음량 처리 없이 그대로, 정규화는 본편만 2패스 linear. 로컬 ffmpeg 가 있을 때만 (CI 는 워커 테스트를 돌리지 않는다)
test("징글 조립 — 징글은 스테레오·음량 그대로 앞뒤에 붙고, 본편만 linear 로 정규화된다", { skip: !hasFfmpeg && "ffmpeg 없음" }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jingle-"));
  const ff = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  const jingle = path.join(dir, "jingle.wav"), seg = path.join(dir, "seg.pcm");
  // 앞 1초 무음 + 톤 1초(왼쪽 440Hz · 오른쪽 660Hz — 모노로 합치면 달라진다) + 끝 1초 무음 = 3초, 44.1kHz 스테레오(업로드 CLI 가 맞춘 포맷)
  await ff(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=44100:duration=1",
    "-filter_complex", "[0:a][1:a]join=inputs=2:channel_layout=stereo,adelay=1000:all=1,apad=pad_dur=1", "-c:a", "pcm_s16le", jingle]);
  await ff(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2", "-f", "s16le", "-ac", "1", "-ar", "44100", seg]);
  assert.ok(Math.abs((await probeTrailingSilenceSec(jingle)) - 1) < 0.1);
  const segment = { data: await fs.readFile(seg), format: "pcm_44100" as const };
  const r = await assemble({ segments: [segment], gapSec: [], workDir: dir, masterOut: path.join(dir, "m.wav"), distOut: path.join(dir, "d.mp3"), introFile: jingle, outroFile: jingle });
  assert.ok(Math.abs(r.introSec - 3) < 0.1, `인트로 ${r.introSec}`);
  assert.equal(r.leadSec, 0); assert.equal(r.outroPadSec, 0);
  assert.ok(r.durationSec > 7.8 && r.durationSec < 8.4, `전체 ${r.durationSec}`); // 인트로 3 + 본편 2 + 아웃트로 3
  assert.equal(await channelsOf(path.join(dir, "m.wav")), 2, "마스터 스테레오");
  assert.equal(await channelsOf(path.join(dir, "d.mp3")), 2, "배포본 스테레오");
  // 징글 구간은 음량이 그대로다 (원본 톤 구간과 평균 레벨 차 0.3dB 이내 — 1패스 loudnorm 시절엔 수 dB 끌어올려졌다)
  const jSrc = await meanDb(jingle, 1, 1), jOut = await meanDb(path.join(dir, "m.wav"), 1, 1);
  assert.ok(Math.abs(jSrc - jOut) < 0.3, `징글 레벨 원본 ${jSrc} · 마스터 ${jOut}`);
  assert.equal(r.loudness.type, "linear", `정규화 ${JSON.stringify(r.loudness)}`);
  assert.ok(Math.abs(r.loudness.outputI - r.loudness.targetI) < 1, `본편 ${r.loudness.outputI} / 목표 ${r.loudness.targetI}`);
  const plain = await assemble({ segments: [segment], gapSec: [], workDir: dir, masterOut: path.join(dir, "m2.wav"), distOut: path.join(dir, "d2.mp3") });
  assert.equal(plain.introSec, 0); assert.equal(plain.leadSec, 2);
  assert.ok(plain.durationSec > 5.8 && plain.durationSec < 6.4, `징글 없음 ${plain.durationSec}`); // 앞 2 + 본편 2 + 뒤 2
  await fs.rm(dir, { recursive: true, force: true });
});
