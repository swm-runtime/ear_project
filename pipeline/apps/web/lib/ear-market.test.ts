import { test } from "node:test";
import assert from "node:assert/strict";
import { contentMarket, splitConsoleTopics, type EarTopic } from "./ear";

// 2026-10-19 BE 요청(KAN-202·KAN-190) — 발행 payload 에 market·language 를 두 트랙 모두 명시한다. 허용 조합은 kr+ko, global+en
test("글로벌 콘솔은 global·en 을 싣는다", () => {
  assert.deepEqual(contentMarket("global"), { market: "global", language: "en" });
});

test("한국판 콘솔과 시장을 모를 때는 kr·ko 를 싣는다", () => {
  assert.deepEqual(contentMarket("kr"), { market: "kr", language: "ko" });
  assert.deepEqual(contentMarket(undefined), { market: "kr", language: "ko" });
});

// 2026-10-20 — 서버 주제 목록이 두 시장 주제를 함께 주고 시장 칸이 없다. 콘솔은 이 시장 주제만 보인다
const topic = (name: string, market?: "kr" | "global"): EarTopic => ({ id: name, name, parent_category: "x", is_visible: true, display_order: 1, content_count: 0, ...(market ? { market } : {}) });
test("주제에 시장 칸이 없으면 이 인스턴스 파이프라인 중분류 이름으로 가른다", () => {
  const r = splitConsoleTopics([topic("K-Food"), topic("돈·경제"), topic("Korean Culture")], "global", ["K-Food", "Korean Culture"]);
  assert.deepEqual(r.mine.map((t) => t.name), ["K-Food", "Korean Culture"]);
  assert.deepEqual(r.others.map((t) => t.name), ["돈·경제"]);
});
test("시장 칸이 오면 그 값이 이긴다 — 이름이 체계에 있어도 다른 시장이면 숨긴다", () => {
  const r = splitConsoleTopics([topic("K-Food", "kr"), topic("K-Food", "global")], "global", ["K-Food"]);
  assert.deepEqual(r.mine.map((t) => t.market), ["global"]);
  assert.deepEqual(r.others.map((t) => t.market), ["kr"]);
});
