import { test } from "node:test";
import assert from "node:assert/strict";
import { contentMarket } from "./ear";

// 2026-10-19 BE 요청(KAN-202·KAN-190) — 발행 payload 에 market·language 를 두 트랙 모두 명시한다. 허용 조합은 kr+ko, global+en
test("글로벌 콘솔은 global·en 을 싣는다", () => {
  assert.deepEqual(contentMarket("global"), { market: "global", language: "en" });
});

test("한국판 콘솔과 시장을 모를 때는 kr·ko 를 싣는다", () => {
  assert.deepEqual(contentMarket("kr"), { market: "kr", language: "ko" });
  assert.deepEqual(contentMarket(undefined), { market: "kr", language: "ko" });
});
