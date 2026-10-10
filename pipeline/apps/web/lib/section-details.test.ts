import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionsForSend, SEND_SECTION_DETAILS } from "./section-details";

// KAN-152 (2026-10-07) — 구간의 kind·summary 는 서버 KAN-151 이 운영에 나간 뒤 켠다
const secs = [
  { start_sec: 0, title: "인트로", kind: "intro", summary: "왜 충분히 자도 피곤할까?" },
  { start_sec: 61.7, title: "깬 직후의 멍함은 잠이 모자란 신호가 아니다", kind: "body", summary: "멍함은 정상적 수면 관성" },
];

test("SEND_SECTION_DETAILS — KAN-151 운영 배포(v1.2.0+4) 뒤 켰다", () => {
  assert.equal(SEND_SECTION_DETAILS, true);
});

test("sectionsForSend — 꺼져 있으면 start_sec·title 만 보낸다", () => {
  assert.deepEqual(sectionsForSend(secs, false), [{ start_sec: 0, title: "인트로" }, { start_sec: 61.7, title: "깬 직후의 멍함은 잠이 모자란 신호가 아니다" }]);
});

test("sectionsForSend — 켜면 kind·summary 를 싣는다", () => {
  assert.deepEqual(sectionsForSend(secs, true), secs);
});

test("sectionsForSend — 켜도 서버가 거부할 값은 그 키만 뺀다", () => {
  const out = sectionsForSend([{ start_sec: 0, title: "t", kind: "chapter", summary: "가".repeat(41) }, { start_sec: 5, title: "u", kind: "outro", summary: "  " }], true);
  assert.deepEqual(out, [{ start_sec: 0, title: "t" }, { start_sec: 5, title: "u", kind: "outro" }]);
});
