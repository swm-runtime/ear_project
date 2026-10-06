import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
process.env.ELEVENLABS_API_KEY ??= "test-key";
const { FORMATS, TS_FORMATS, alignmentUpload, resetFormat, synthDialogueWithTimestamps } = await import("./elevenlabs.js");

const okBody = (format: string) => JSON.stringify({ audio_base64: Buffer.from(format).toString("base64"), alignment: { characters: ["a"], character_start_times_seconds: [0], character_end_times_seconds: [0.1] } });

// 2026-10-06 KAN-142: 타임스탬프 경로도 무손실(wav_44100)부터 요청하고, 티어 제한이면 같은 칸의 mp3 로 내려간다
test("포맷 사다리 — 일반·타임스탬프 사다리는 칸마다 같은 티어다", () => {
  assert.equal(FORMATS.length, TS_FORMATS.length);
  assert.deepEqual([FORMATS[0], TS_FORMATS[0]], ["pcm_44100", "wav_44100"]);
  assert.deepEqual(FORMATS.slice(1), TS_FORMATS.slice(1));
});

test("타임스탬프 합성 — wav 를 먼저 요청하고, 티어 제한이면 mp3 192k 로 강등, 다음 작업은 다시 wav 부터", async (t) => {
  const asked: string[] = [];
  let denyWav = true;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const format = new URL(url).searchParams.get("output_format")!;
    asked.push(format);
    if (format === "wav_44100" && denyWav) return new Response('{"detail":{"status":"output_format_not_allowed","message":"upgrade your subscription"}}', { status: 403 });
    return new Response(okBody(format), { status: 200 });
  });
  resetFormat();
  const a = await synthDialogueWithTimestamps([{ text: "안녕", voice_id: "v" }], 1);
  assert.equal(a.format, "mp3_44100_192");
  const b = await synthDialogueWithTimestamps([{ text: "안녕", voice_id: "v" }], 1); // 같은 작업 안에서는 강등 고정
  assert.equal(b.format, "mp3_44100_192");
  assert.deepEqual(asked, ["wav_44100", "mp3_44100_192", "mp3_44100_192"]);
  denyWav = false;
  resetFormat(); // 다음 작업 — 플랜을 올렸다면 재시작 없이 wav 로 돌아온다
  const c = await synthDialogueWithTimestamps([{ text: "안녕", voice_id: "v" }], 1);
  assert.equal(c.format, "wav_44100");
});

test("강제 정렬 업로드 형식 — RIFF 헤더면 wav, ftyp 면 m4a, 아니면 mp3", () => {
  assert.deepEqual(alignmentUpload(Buffer.from("RIFF\0\0\0\0WAVEfmt ", "latin1")), { type: "audio/wav", name: "audio.wav" });
  assert.deepEqual(alignmentUpload(Buffer.from("ID3\x04\0\0", "latin1")), { type: "audio/mpeg", name: "dist.mp3" });
  assert.deepEqual(alignmentUpload(Buffer.from("\0\0\0\x20ftypM4A \0\0", "latin1")), { type: "audio/mp4", name: "dist.m4a" });
});
