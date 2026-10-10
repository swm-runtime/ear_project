import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEnrichment } from "@ear/pipeline";

// KAN-139 (2026-10-08): 화면 해시태그 tags — 서버가 형식 3을 받기 전까지 파일에 싣지 않는다(ENRICH_TAGS)
const base = { difficulty: "beginner", format: "overview", is_evergreen: true, keywords: ["뱅크런", "예금보험", "유동성"] };

test("태그 스위치가 꺼져 있으면 파일은 형식 2 그대로이고 태그는 결과에만 남는다", () => {
  const n = normalizeEnrichment({ ...base, tags: ["뱅크런", "예금보험"] }, ["경제 상식"], []);
  assert.equal(n.file?.schema_version, 2);
  assert.equal("tags" in (n.file ?? {}), false);
  assert.deepEqual(n.tags, ["뱅크런", "예금보험"]);
});

test("태그 스위치를 켜면 형식 3으로 tags 를 싣는다 — '#'은 떼고 순서는 유지한다", () => {
  const n = normalizeEnrichment({ ...base, tags: ["#뱅크런", "예금보험", "유동성"] }, ["경제 상식"], [], { tags: true });
  assert.equal(n.file?.schema_version, 3);
  assert.deepEqual(n.file?.tags, ["뱅크런", "예금보험", "유동성"]);
});

test("규칙 밖 태그(띄어쓰기·11자 이상·주제명·중복)는 그 태그만 빼고 4개를 넘으면 자른다", () => {
  const n = normalizeEnrichment({ ...base, tags: ["지급 불능", "아주아주긴태그이름입니다", "경제상식", "뱅크런", "뱅크런", "예금보험", "유동성", "금리", "부실채권"] }, ["경제 상식"], [], { tags: true });
  assert.deepEqual(n.file?.tags, ["뱅크런", "예금보험", "유동성", "금리"]);
  assert.ok(n.warnings.some((w) => w.includes("지급 불능")));
  assert.ok(n.warnings.some((w) => w.includes("주제명 반복 태그")));
});

test("남은 태그가 1개면 키를 빼고 파일은 그대로 낸다 — 태그 때문에 메타 전체를 버리지 않는다", () => {
  const n = normalizeEnrichment({ ...base, tags: ["뱅크런", "지급 불능"] }, ["경제 상식"], [], { tags: true });
  assert.ok(n.file);
  assert.equal("tags" in n.file!, false);
  assert.ok(n.warnings.some((w) => w.includes("2개 미만")));
});
