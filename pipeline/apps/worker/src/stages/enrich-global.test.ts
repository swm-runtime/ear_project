import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnrichPrompt, ENRICH_SCHEMA, ENRICH_TAG_RE, enrichSchema, enrichTagRe, normalizeEnrichment } from "@ear/pipeline";

// 2026-10-15 KAN-202 — 글로벌판(en) 추천 메타: target_audiences 없음 · 태그 공백 허용 2~20자(global-api 4.9). 한국판은 인자를 안 넘겨 종전 그대로.
// language 는 파일에 싣지 않는다 — 명세상 선택이고 서버 파서가 모르는 키는 파일째 거부한다(언어는 발행 payload 로 간다)
const input = { title: "t", description: "d", topicNames: ["K-Pop"], origin: "ai_generated", script: "s", jobCategories: ["개발"], yearsRanges: ["0-1"], criteria: "c" };
const raw = () => ({ difficulty: "beginner", format: "overview", is_evergreen: true, keywords: ["idol trainee system", "fandom economy", "survival shows"], tags: ["Stray Kids", " #Squid  Game ", "BLACKPINK", "K-Pop", "a"], target_audiences: [{ job_category: "개발", years_of_experience: "0-1" }] });

test("글로벌 태그 규칙: 공백 허용 2~20자·앞뒤 공백 없음, 한국판 규칙은 그대로", () => {
  assert.equal(enrichTagRe("en").test("Stray Kids"), true);
  assert.equal(enrichTagRe("en").test(" Stray Kids"), false);
  assert.equal(enrichTagRe("en").test("A".repeat(21)), false);
  assert.equal(enrichTagRe(), ENRICH_TAG_RE);
  assert.equal(ENRICH_TAG_RE.test("Stray Kids"), false);
});

test("글로벌 정규화: target_audiences 는 경고와 함께 버리고, 태그 공백을 정리하며, 서버가 모르는 language 키는 싣지 않는다", () => {
  const n = normalizeEnrichment(raw(), ["K-Pop"], [], { tags: true, locale: "en" });
  assert.equal("language" in (n.file ?? {}), false);
  assert.equal(n.file?.target_audiences, undefined);
  assert.deepEqual(n.file?.tags, ["Stray Kids", "Squid Game", "BLACKPINK"]);
  assert.ok(n.warnings.some((w) => w.includes("target_audiences 제외")));
  assert.ok(!n.warnings.some((w) => w.includes("생략된 키") && w.includes("target_audiences")));
});

test("한국판 정규화(locale 없음)는 target_audiences 를 검증해 싣는다", () => {
  const n = normalizeEnrichment(raw(), ["심리학"], ["개발"], { tags: true });
  assert.deepEqual(n.file?.target_audiences, [{ job_category: "개발", years_of_experience: "0-1" }]);
});

test("글로벌 스키마·프롬프트에는 직군 칸이 없고, 한국판은 그대로다", () => {
  assert.equal("target_audiences" in enrichSchema("en").properties, false);
  assert.equal(enrichSchema(), ENRICH_SCHEMA);
  assert.equal(buildEnrichPrompt({ ...input, locale: "en" }).includes("job_category"), false);
  assert.equal(buildEnrichPrompt(input).includes("target_audiences[].job_category: 개발"), true);
});

// 2026-10-19 G261018-013·015: 영어 편의 keywords 가 한국어("나이 질문", "포장이사")로 나왔다 — 글로벌 프롬프트만 영어로 쓰게 한다
test("글로벌 프롬프트는 keywords·tags 를 영어(한국어 낱말은 로마자)로 쓰게 하고, 한국판 프롬프트는 그대로다", () => {
  assert.equal(buildEnrichPrompt({ ...input, locale: "en" }).includes("keywords·tags 는 콘텐츠 언어인 영어로 쓴다"), true);
  assert.equal(buildEnrichPrompt(input).includes("콘텐츠 언어인 영어"), false);
});
