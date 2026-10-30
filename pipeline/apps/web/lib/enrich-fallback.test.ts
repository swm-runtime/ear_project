import { test } from "node:test";
import assert from "node:assert/strict";

import { currentEpisodeEnrichments, runSchemaVersion } from "./enrich-fallback";

// 2026-10-31 — 발행 전에 뽑아 둔 에피소드 모드 추천 메타를 발행분 [반영]·[구형 전체 재발행]의 대체로 쓴다
test("실행 기록의 형식 버전", () => {
  assert.equal(runSchemaVersion("enrich-v2 (schema 3)"), 3);
  assert.equal(runSchemaVersion("enrich-v1 (schema 2)"), 2);
  assert.equal(runSchemaVersion("enrich-copy (manual)"), null);
  assert.equal(runSchemaVersion(null), null);
});

test("현행 형식 에피소드 모드 산출물만 — 콘텐츠 모드·구형은 빼고 보고서 파일도 빼고", () => {
  const got = currentEpisodeEnrichments([
    { prompt_version: "enrich-v2 (schema 3)", artifacts: ["s3:episodes/T261031-061/enrichment.json", "s3:episodes/T261031-061/enrichment.report.json"] },
    { prompt_version: "enrich-v2 (schema 3)", artifacts: ["s3:datasets/enrichment/0019b0f9-3928-4a2c-bda7-b55062c53a25.json"] },
    { prompt_version: "enrich-v1 (schema 2)", artifacts: ["s3:episodes/T261001-001/enrichment.json"] },
    { prompt_version: "enrich-copy (manual)", artifacts: ["s3:episodes/T261001-002/enrichment.json"] },
    { prompt_version: "enrich-v2 (schema 3)", artifacts: null },
  ]);
  assert.deepEqual([...got], ["T261031-061"]);
});
