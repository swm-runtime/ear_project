import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeXmlEntities, parseFeed } from "./sweep.js";

// 2026-10-16 — 피드 링크의 &amp; 가 URL 에 남아 열리지 않는 링크가 적재됐다(InfoQ·Google 비즈니스 블로그)
test("RSS·Atom 링크의 XML 엔티티를 풀어 적재한다", () => {
  const rss = `<rss><channel><item><title>A</title><link>https://www.infoq.com/news/2026/10/x/?utm_campaign=infoq_content&amp;utm_source=infoq&amp;utm_medium=feed</link></item></channel></rss>`;
  assert.equal(parseFeed(rss)[0].url, "https://www.infoq.com/news/2026/10/x/?utm_campaign=infoq_content&utm_source=infoq&utm_medium=feed");
  const atom = `<feed><entry><title>B</title><link rel="alternate" href="https://business.google.com/a?x=1&amp;y=2"/></entry></feed>`;
  assert.equal(parseFeed(atom)[0].url, "https://business.google.com/a?x=1&y=2");
});

test("엔티티 풀기 — 숫자·16진·이름 엔티티, 모르는 것은 그대로", () => {
  assert.equal(decodeXmlEntities("a&amp;b&#38;c&#x26;d&lt;&gt;&quot;&apos;"), `a&b&c&d<>"'`);
  assert.equal(decodeXmlEntities("x&nbsp;y&amp"), "x&nbsp;y&amp");
  assert.equal(decodeXmlEntities("https://plain.example/a?b=1&c=2"), "https://plain.example/a?b=1&c=2");
});
