import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { tierOfUrl } = await import("../db.js");

// 2026-10-15 — 도메인 행은 www. 없이 저장된다. URL 호스트(www.korea.net)로만 찾아 판정한 도메인이 미판정으로 보였다(글로벌 C2)
const tiers = new Map([["korea.net", "allow_open"], ["blog.example.com", "allow_support"]]);

test("www. 가 붙은 URL 도 www. 없는 도메인 행의 등급을 찾는다", () => {
  assert.equal(tierOfUrl(tiers, "https://www.korea.net/NewsFocus/Culture/view?articleId=1"), "allow_open");
  assert.equal(tierOfUrl(tiers, "https://korea.net/a"), "allow_open");
});
test("하위 도메인은 www. 만 벗긴다 — 다른 하위 도메인으로 넓히지 않는다", () => {
  assert.equal(tierOfUrl(tiers, "https://blog.example.com/x"), "allow_support");
  assert.equal(tierOfUrl(tiers, "https://news.example.com/x"), undefined);
});
test("URL 로 못 찾으면 넘겨받은 도메인 값으로", () => {
  assert.equal(tierOfUrl(tiers, "not a url", "www.korea.net"), "allow_open");
});
