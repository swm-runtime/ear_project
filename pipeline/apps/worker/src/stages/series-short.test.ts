import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "@ear/pipeline";

// 0041 (KAN-296, 2026-10-30) — 짧은 판 시리즈: 원본 편을 개념 단위로 나눈 설계안
const ep = (no: number, from_no: unknown, title = `편${no}`) => ({ no, from_no: from_no as number, title, scope: "a, b", carries: "c", only_here: "d", minutes: 9 });

test("짧은 판 설계안 정리 — 번호 다시 매김, from_no 범위·순서 보정, 빠진 원본 편", () => {
  const { plan, missing } = P.normalizeShortSeriesPlan([ep(1, 1), ep(2, 1), ep(3, 3), ep(4, 2), ep(5, 9), ep(6, "x"), { ...ep(7, 4), title: " " }], 4, 12);
  assert.deepEqual(plan.map((e) => [e.no, e.from_no]), [[1, 1], [2, 1], [3, 3], [4, 3], [5, 3], [6, 3]], "줄어드는 from_no 와 범위 밖·숫자 아님은 앞 편 원본으로 붙는다");
  assert.equal(plan[0].carries, "", "1화는 이어받음 없음");
  assert.deepEqual(missing, [2, 4]);
  assert.equal(P.normalizeShortSeriesPlan([{ ...ep(1, 1), minutes: 30 }], 1, 12).plan[0].minutes, 12, "분량은 상한으로 자른다");
});

test("층 구간을 새 편 번호로 — 원본 범위에 속한 새 편의 최소~최대", () => {
  // 원본 연결:1-2, 처리:3-4 → 새 편 from_no [1,1,2,3,3,4]
  assert.equal(P.remapLayers("연결:1-2, 처리:3-4", [1, 1, 2, 3, 3, 4]), "연결:1-3, 처리:4-6");
  assert.equal(P.remapLayers("연결:1-2, 처리:3-4, 운영:5-6", [1, 2, 3]), "연결:1-2, 처리:3-3", "새 편이 없는 층은 뺀다");
  assert.equal(P.remapLayers("", [1]), null);
  assert.equal(P.remapLayers("이상한 값", [1]), null);
});

test("짧은 판 설계안 프롬프트 — 원본 편·범위·소스·from_no 규칙", () => {
  const p = P.buildShortSeriesPlanPrompt({ name: "계층마다 보는 네트워크", midTopic: "IT·개발", original: [{ ...ep(1, undefined, "OSI 계층"), only_here: "캡슐화 원리" }], sources: { 1: ["매체 — 글 제목"] }, minMinutes: 5, maxMinutes: 12 });
  assert.match(p, /### 원본 1화 — OSI 계층/);
  assert.match(p, /이 편에서만 자세히: 캡슐화 원리/);
  assert.match(p, /소스: 매체 — 글 제목/);
  assert.match(p, /5분 이상 12분 이하/);
  assert.match(p, /from_no 에 그 원본 편 번호/);
});
