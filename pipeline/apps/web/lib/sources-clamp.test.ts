import { test } from "node:test";
import assert from "node:assert/strict";
import { clampSources } from "./sources-clamp";

test("sources 한도 — 발행처 100자·제목 255자로 자르고(단어 경계 + …), 제목 없는 항목은 빼고, 빈 발행처·URL 은 키를 넣지 않는다", () => {
  const longPub = "International Information and Networking Centre for Intangible Cultural Heritage in the Asia-Pacific Region under the auspices of UNESCO"; // 149자 — 2026-10-27 G261026-058 실패 원인
  const out = clampSources([{ title: " Kimjang ", publisher: longPub, url: " https://x.y/z " }, { title: "", publisher: "a" }, { title: "t2", publisher: "", url: "" }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, "Kimjang");
  assert.ok(out[0].author!.length <= 100 && out[0].author!.endsWith("…") && !out[0].author!.includes("  "));
  assert.equal(out[0].url, "https://x.y/z");
  assert.deepEqual(out[1], { title: "t2" });
  assert.equal(clampSources([{ title: "short", author: "Pub" }])[0].author, "Pub");
});
