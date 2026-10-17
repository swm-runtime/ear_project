import { test } from "node:test";
import assert from "node:assert/strict";
import { domainForUrl, pendingDomainsOf, type Gate1Domain } from "./gate1";

// 2026-10-17 — 글로벌판 게이트 1 승인 조건은 없다(한국판과 같게). 판정 대기 도메인은 참고 목록으로만 보인다
const domains: Gate1Domain[] = [
  { id: "d1", domain: "korea.net", tier: "allow_open" },
  { id: "d2", domain: "soompi.com", tier: "allow_support" },
  { id: "d3", domain: "newblog.example", tier: "candidate" },
  { id: "d4", domain: "medium.com/@kfood", tier: "allow_open" },
];

test("candidate·미등록 도메인만 판정 대기 목록에 오른다", () => {
  const sources = [{ url: "https://www.korea.net/a", backbone: true }, { url: "https://soompi.com/b" }, { url: "https://newblog.example/x" }, { url: "https://unknown.example/y" }];
  assert.deepEqual(pendingDomainsOf(sources, domains), [{ id: "d3", domain: "newblog.example" }, { id: null, domain: "unknown.example" }]);
});

test("판정이 끝난 소스뿐이거나 소스가 비면 빈 목록이다", () => {
  assert.deepEqual(pendingDomainsOf([{ url: "https://korea.net/a" }, { url: "https://soompi.com/b" }], domains), []);
  assert.deepEqual(pendingDomainsOf(null, domains), []);
});

test("경로가 붙은 공유 호스트 행은 그 경로 아래 URL 에만 맞는다", () => {
  assert.equal(domainForUrl("https://medium.com/@kfood/post-1", domains)?.id, "d4");
  assert.equal(domainForUrl("https://medium.com/@other/post", domains), null);
});
