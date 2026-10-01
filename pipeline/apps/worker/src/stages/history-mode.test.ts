import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAxisCheckPromptParts, buildClusterPromptV2, buildDesignPromptInlineParts, buildWritePromptParts, CLUSTER_SCHEMA_V2, roleIntentFor, ROLE_INTENT, ROLE_INTENT_HISTORY, INTRO_STYLES } from "@ear/pipeline";

// 역사 모드 (2026-10-01): 중분류가 역사일 때만 사건형 축·역할 뜻·구간 순서·대본 지시가 프롬프트에 들어간다
const cand = (mid: string) => ({ id: "C1", mid_topic: mid, title: "t", target_fit: null, angle: null, sources: [], axis: null, axis_type: null, gaps: [] }) as any;
const base = { episodeId: "T000000-001", promptVersion: "full-v9.6(gpt)", guidelines: "규칙", specScript: "## 3. a\n## 4. b\n## 6. c\n## 7. d", goldFullEum: "", goldFullYuna: "" };

test("역사 모드 — 군집화 프롬프트는 역사 중분류가 있을 때만 사건형을 허용한다", () => {
  const i = { midTopics: ["역사"], nextIdNumber: 1, sources: [], existingTitles: [], specBacklogExcerpt: "spec" };
  assert.match(buildClusterPromptV2(i), /사건형/);
  assert.doesNotMatch(buildClusterPromptV2({ ...i, midTopics: ["철학"] }), /사건형/);
  assert.match(buildClusterPromptV2({ ...i, midTopics: ["철학"], seed: { id: "C2", topic: "임진왜란", hint: null, midTopic: "역사" } }), /사건형/);
  assert.ok((CLUSTER_SCHEMA_V2.properties.candidates.items.properties.axis_type.enum as readonly string[]).includes("사건"));
});

test("역사 모드 — 설계·축 심사·대본 프롬프트에 역사 지시가 들어가고, 다른 중분류에는 없다", () => {
  const d = buildDesignPromptInlineParts({ ...base, candidate: cand("역사"), sources: [] } as any);
  assert.match(d.user, /## 0\. 역사 모드/); assert.match(d.user, /배경 → 전개/);
  assert.doesNotMatch(buildDesignPromptInlineParts({ ...base, candidate: cand("철학"), sources: [] } as any).user, /역사 모드/);
  assert.match(buildAxisCheckPromptParts({ outlineMd: "# 구성안", midTopic: "역사" }).system, /역사 모드/);
  assert.doesNotMatch(buildAxisCheckPromptParts({ outlineMd: "# 구성안" }).system, /역사 모드/);
  const w = (mid: string) => buildWritePromptParts({ ...base, candidate: cand(mid), introStyle: INTRO_STYLES[0], templates: null, outlineMd: "", claimsMd: "", sourcesMd: "", pronunciationsJson: "{}", estimatedMinutes: 15 } as any).user;
  assert.match(w("역사"), /역사 모드/); assert.match(w("역사"), /사건이 축이다/);
  assert.doesNotMatch(w("투자"), /역사 모드/);
  assert.equal(roleIntentFor("역사"), ROLE_INTENT_HISTORY); assert.equal(roleIntentFor("투자"), ROLE_INTENT);
});
