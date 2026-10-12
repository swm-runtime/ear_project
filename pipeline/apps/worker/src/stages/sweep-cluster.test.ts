import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterAfterSweep } from "./sweep.js";

// 2026-10-09 — 스윕은 중분류 단위, 군집화 v2 는 대분류 풀. 같은 대분류의 마지막 스윕만 군집화를 건다
test("같은 대분류의 다른 스윕이 남아 있으면 군집화를 건너뛴다 — 마지막 스윕이 건다", () => {
  assert.equal(clusterAfterSweep({ otherSweeps: 2, queuedClusters: 0 }).enqueue, false);
});

test("대분류 군집화가 이미 대기 중이면 건너뛴다 — 그 작업이 이 스윕의 소스까지 본다", () => {
  assert.equal(clusterAfterSweep({ otherSweeps: 0, queuedClusters: 1 }).enqueue, false);
});

test("대분류의 마지막 스윕이고 대기 중인 군집화가 없으면 건다", () => {
  assert.equal(clusterAfterSweep({ otherSweeps: 0, queuedClusters: 0 }).enqueue, true);
});
