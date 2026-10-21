import { test } from "node:test";
import assert from "node:assert/strict";
import { domainKeyOf } from "./pool-discover.js";

// 2026-10-21 — 소스 풀 채우기(스윕 모드 P): 검색 결과 URL 을 spec/01 3장의 도메인 단위로 바꾸고 비발행처는 거른다
test("도메인 키 — 호스트에서 www. 를 떼고, 공유 호스트는 첫 경로 세그먼트까지", () => {
  assert.equal(domainKeyOf("https://www.bok.or.kr/portal/main/main.do"), "bok.or.kr");
  assert.equal(domainKeyOf("https://daily.jstor.org/some-article"), "daily.jstor.org");
  assert.equal(domainKeyOf("https://medium.com/daangn/post-1"), "medium.com/daangn");
  assert.equal(domainKeyOf("https://aws.amazon.com/ko/blogs/korea/x"), "aws.amazon.com/ko");
  assert.equal(domainKeyOf("https://medium.com"), null); // 경로 없는 공유 호스트는 발행처를 가를 수 없다
});
test("도메인 키 — SNS·위키·커뮤니티·상품·개인 블로그 플랫폼·유료 DB 는 null", () => {
  for (const u of ["https://www.youtube.com/watch?v=1", "https://namu.wiki/w/김장", "https://blog.naver.com/someone/123", "https://brunch.co.kr/@writer/1", "https://www.researchgate.net/publication/1", "https://news.naver.com/article/1", "https://x.com/a/status/1", "ftp://example.org/x", "not a url"]) assert.equal(domainKeyOf(u), null, u);
  assert.equal(domainKeyOf("https://techblog.woowahan.com/1234/"), "techblog.woowahan.com"); // 기업 공식 블로그는 남는다
});
test("소스 풀 채우기 프롬프트 — 중분류·메모·기존 풀 호스트가 들어가고, 글로벌판은 영어, 스키마는 발행처 필드를 요구한다", async () => {
  const P = await import("@ear/pipeline");
  const input = { midTopic: "경제 상식", hint: "학회·연구기관 위주", mids: ["경제 상식", "금융"], existingHosts: ["bok.or.kr", "kdi.re.kr"], maxSearches: 8 };
  const ko = P.buildPoolDiscoverPrompt(input);
  assert.match(ko, /경제 상식/); assert.match(ko, /학회·연구기관 위주/); assert.match(ko, /bok\.or\.kr, kdi\.re\.kr/); assert.match(ko, /최대 8회/);
  const en = P.buildPoolDiscoverPromptEn({ ...input, midTopic: "K-Food", mids: ["K-Food"], hint: null });
  assert.match(en, /K-Food/); assert.doesNotMatch(en.replace(/"[^"]*"/g, ""), /[가-힣]/); // 지시문 본문은 영어 — 따옴표 안 예시 검색어의 한국어만 허용
  assert.deepEqual([...P.POOL_DISCOVER_SCHEMA.properties.sources.items.required], ["url", "publisher", "category", "feed_url", "why", "coverage"]);
});
