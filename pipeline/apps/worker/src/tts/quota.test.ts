import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { parseSubscription, dueAlerts, ALERT_RATIOS } = await import("./quota.js");

test("구독 응답에서 잔량·비율·리셋 시각을 읽는다 (KAN-204)", () => {
  const s = parseSubscription({ tier: "creator", status: "active", character_count: 800_000, character_limit: 1_000_000, next_character_count_reset_unix: 1_762_000_000 });
  assert.ok(s);
  assert.equal(s.remaining, 200_000);
  assert.equal(s.ratio, 0.2);
  assert.equal(s.reset_at, new Date(1_762_000_000 * 1000).toISOString());
  assert.equal(s.tier, "creator");
});

test("한도가 없거나 형식이 다르면 null — 리셋 시각이 없으면 null 로 둔다", () => {
  assert.equal(parseSubscription({}), null);
  assert.equal(parseSubscription({ character_count: "x", character_limit: 10 }), null);
  assert.equal(parseSubscription({ character_count: 5, character_limit: 0 }), null);
  const s = parseSubscription({ character_count: 1_200, character_limit: 1_000 });
  assert.ok(s);
  assert.equal(s.remaining, 0, "초과 사용은 잔량 0");
  assert.equal(s.reset_at, null);
});

test("문턱 알림은 넘은 문턱만, 같은 리셋 주기에는 한 번만", () => {
  const period = "2026-11-01T00:00:00.000Z";
  assert.deepEqual(dueAlerts({ ratio: 0.5, reset_at: period }, {}), []);
  assert.deepEqual(dueAlerts({ ratio: 0.2, reset_at: period }, {}), [0.2]);
  assert.deepEqual(dueAlerts({ ratio: 0.03, reset_at: period }, {}), [...ALERT_RATIOS], "한 번에 두 문턱을 지나면 둘 다 기록한다");
  assert.deepEqual(dueAlerts({ ratio: 0.1, reset_at: period }, { "0.2": period }), [], "이미 알린 주기");
  assert.deepEqual(dueAlerts({ ratio: 0.03, reset_at: period }, { "0.2": period }), [0.05], "다음 문턱만");
  assert.deepEqual(dueAlerts({ ratio: 0.1, reset_at: "2026-12-01T00:00:00.000Z" }, { "0.2": period }), [0.2], "리셋 주기가 바뀌면 다시 알린다");
  assert.deepEqual(dueAlerts({ ratio: 0.1, reset_at: null }, { "0.2": "unknown" }), [], "리셋 시각을 모르면 한 번만");
});
