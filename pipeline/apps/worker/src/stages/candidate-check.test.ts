import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCandidateSources } from "./candidate-check.js";

const s = (publisher: string, roles: string[]) => ({ publisher, domain: publisher, roles });

test("후보 성립 판정: 발행처 3곳·역할 3종·근거 앵커면 성립", () => {
  const r = checkCandidateSources([s("A", ["근거 앵커"]), s("B", ["사례"]), s("C", ["수치·조사"])]);
  assert.equal(r.ok, true); assert.deepEqual(r.problems, []); assert.deepEqual(r.missingCore, []);
});
test("후보 성립 판정: 한 발행처가 절반을 넘으면 문제로 잡는다", () => {
  const r = checkCandidateSources([s("A", ["근거 앵커"]), s("A", ["사례"]), s("A", ["수치·조사"]), s("B", ["반론·한계"])]);
  assert.equal(r.ok, false); assert.ok(r.problems.some((p) => p.startsWith("한 발행처 75%")));
});
test("후보 성립 판정: 근거 앵커·사례가 비면 missingCore 에 든다", () => {
  const r = checkCandidateSources([s("A", ["수치·조사"]), s("B", ["반론·한계"]), s("C", ["역사·맥락"])]);
  assert.deepEqual(r.missingCore, ["근거 앵커", "사례"]); assert.ok(r.problems.includes("근거 앵커 없음"));
});
test("후보 성립 판정: 소스가 없으면 전부 문제", () => {
  const r = checkCandidateSources([]);
  assert.equal(r.ok, false); assert.ok(r.problems.includes("소스 0건"));
});
test("후보 성립 판정: 글로벌판 국문 소스 하한 — 제목이 한글인 소스를 센다", () => {
  const t = (publisher: string, roles: string[], title: string) => ({ ...s(publisher, roles), title });
  const one = [t("A", ["근거 앵커"], "돌잔치의 유래"), t("B", ["사례"], "A first birthday in Seoul"), t("C", ["수치·조사"], "Survey")];
  assert.equal(checkCandidateSources(one).ok, true); // 한국판(옵션 없음)은 언어를 세지 않는다
  assert.ok(checkCandidateSources(one, { minKorean: 2 }).problems.includes("국문 소스 1건"));
  const two = [...one.slice(0, 2), t("C", ["수치·조사"], "돌잔치 비용 조사")];
  assert.equal(checkCandidateSources(two, { minKorean: 2 }).ok, true);
});
