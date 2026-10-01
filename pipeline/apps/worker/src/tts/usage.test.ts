import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { resetUsage, tally, usage } = await import("./elevenlabs.js");

// 2026-10-01: 편당 실제 차감 크레딧 — 응답 헤더 character-cost 합산, 헤더 없는 응답은 unmetered
test("ElevenLabs 사용량 계측 — character-cost 헤더를 합산하고 없는 응답은 따로 센다", () => {
  resetUsage();
  tally(new Headers({ "character-cost": "812" }));
  tally(new Headers({ "character-cost": "1203" }));
  tally(new Headers({}));
  tally(new Headers({ "character-cost": "abc" }));
  assert.deepEqual(usage(), { requests: 4, credits: 2015, unmetered: 2 });
  resetUsage();
  assert.deepEqual(usage(), { requests: 0, credits: 0, unmetered: 0 });
});
