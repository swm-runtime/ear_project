import { test } from "node:test";
import assert from "node:assert/strict";
import { domainForUrl, gate1Check, type Gate1Domain, type Gate1Row } from "./gate1";

// 2026-10-15 KAN-209 — 글로벌판 게이트 1: 도메인 전부 판정 · 뼈대 1군 · 배제 주제 아님 · 경고 확인 기록이 모두 참이어야 승인이 열린다
const domains: Gate1Domain[] = [
  { id: "d1", domain: "korea.net", tier: "allow_open" },
  { id: "d2", domain: "soompi.com", tier: "allow_support" },
  { id: "d3", domain: "newblog.example", tier: "candidate" },
  { id: "d4", domain: "medium.com/@kfood", tier: "allow_open" },
];
const pass = { screen: { excluded: false } };
const row = (o: Partial<Gate1Row> = {}): Gate1Row => ({
  sources: [{ url: "https://www.korea.net/a", backbone: true }, { url: "https://soompi.com/b" }],
  gaps: [], dedup_note: null, gate1_checks: pass, ...o,
});

test("도메인 전부 판정 · 뼈대 1군 · 배제 판정 통과 · 경고 없음이면 승인이 열린다", () => {
  assert.deepEqual(gate1Check(row(), domains), { ok: true, blockers: [], pendingDomains: [], needsWarningConfirm: false });
});

test("candidate·미등록 도메인이 있으면 막고 판정 대기 목록을 돌려준다", () => {
  const g = gate1Check(row({ sources: [{ url: "https://korea.net/a", backbone: true }, { url: "https://newblog.example/x" }, { url: "https://unknown.example/y" }] }), domains);
  assert.equal(g.ok, false);
  assert.deepEqual(g.pendingDomains, [{ id: "d3", domain: "newblog.example" }, { id: null, domain: "unknown.example" }]);
});

test("뼈대 소스가 없거나 1군이 아니면 막는다", () => {
  assert.match(gate1Check(row({ sources: [{ url: "https://korea.net/a" }] }), domains).blockers.join(), /뼈대\(근거 앵커\) 소스 없음/);
  assert.match(gate1Check(row({ sources: [{ url: "https://soompi.com/b", roles: ["근거 앵커"] }] }), domains).blockers.join(), /1군이 아님: soompi\.com\(allow_support\)/);
});

test("배제 주제 판정 기록이 없거나 배제면 막는다", () => {
  assert.match(gate1Check(row({ gate1_checks: null }), domains).blockers.join(), /판정 기록 없음/);
  assert.match(gate1Check(row({ gate1_checks: { screen: { excluded: true, reason: "특정인 사안" } } }), domains).blockers.join(), /배제 주제: 특정인 사안/);
});

test("빈 역할·소스 겹침 경고는 사람 확인 기록이 있어야 열린다", () => {
  assert.equal(gate1Check(row({ gaps: ["반론·한계"] }), domains).ok, false);
  assert.equal(gate1Check(row({ dedup_note: "⚠️ 소스 겹침: C61 2건 | 🔎 기획" }), domains).ok, false);
  assert.equal(gate1Check(row({ gaps: ["반론·한계"], gate1_checks: { ...pass, warnings_confirmed: { at: "2026-10-15T00:00:00Z", by: "u1" } } }), domains).ok, true);
});

test("경로가 붙은 공유 호스트 행은 그 경로 아래 URL 에만 맞는다", () => {
  assert.equal(domainForUrl("https://medium.com/@kfood/post-1", domains)?.id, "d4");
  assert.equal(domainForUrl("https://medium.com/@other/post", domains), null);
});
