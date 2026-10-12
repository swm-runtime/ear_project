import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStages, type EpisodeRow } from "./stages";

// 2026-10-09 — 10월 이전 미발행 후보를 일괄 반려했다. 반려된 편은 목록에서 "판정 대기"·"QA 대기"처럼 진행 중으로 보이면 안 된다
const ep: EpisodeRow = { id: "T260915-001", backlog_id: "C142", script_key: "s3:x/script.md", qa_report_key: "s3:x/qa.md", critic_report_key: "s3:x/critic.md", audio_dist_key: null, critic_verdicts: null };

test("반려된 후보의 편은 판정 대기 대신 반려를 안내하고, 남은 단계를 대기로 그리지 않는다", () => {
  const { stages, problem } = computeStages(ep, { id: "C142", status: "rejected", published_content_ref: null }, []);
  assert.equal(problem?.stage, "반려");
  assert.equal(problem?.tone, "info");
  assert.ok(stages.every((s) => s.state !== "pending"));
  assert.equal(stages.find((s) => s.key === "draft")?.state, "done"); // 이미 한 단계는 그대로
});

test("반려되지 않은 편은 종전처럼 판정 대기를 안내한다", () => {
  const { problem } = computeStages(ep, { id: "C142", status: "qa_passed", published_content_ref: null }, []);
  assert.equal(problem?.stage, "판정");
});
