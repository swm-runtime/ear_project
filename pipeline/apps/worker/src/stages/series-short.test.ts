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

test("짧은 판 시리즈 편 기획 — 원본 편 번호·콘텐츠 제목·검색 힌트 (2026-10-30 편마다 자료 찾기)", () => {
  const plan = [{ no: 1, title: "가", scope: "", carries: "", only_here: "", minutes: 9, from_no: 1 }, { no: 2, title: "나", scope: "", carries: "", only_here: "", minutes: 9 }];
  assert.equal(P.shortSeriesFromNo(plan, 1), 1);
  assert.throws(() => P.shortSeriesFromNo(plan, 2), /from_no/, "원본 편 번호가 없는 편은 멈춘다");
  assert.throws(() => P.shortSeriesFromNo(plan, 3), /from_no/, "설계안에 없는 화도 멈춘다");
  assert.equal(P.shortSeriesEpisodeTitle("계층마다 보는 네트워크", 5, "IP 주소와 네트워크 경계"), "계층마다 보는 네트워크 5 — IP 주소와 네트워크 경계");
  const h = P.shortSeriesSeedHint("네트워크 계층", [{ title: "RFC 8200", publisher: "IETF" }, { title: "MTU Issues", publisher: "ESnet" }]);
  assert.match(h, /원본 편 "네트워크 계층"의 소스 2건이 판정 후보에 함께 들어간다: IETF — RFC 8200 · ESnet — MTU Issues\./);
  assert.match(h, /검색은 이 소스들이 다루지 않는 이 편 범위의 개념을 찾는다/);
  assert.match(h, /범위에 맞지 않는 원본 소스는 뺀다/);
  assert.match(P.shortSeriesSeedHint("x", []), /소스 0건이 판정 후보에 함께 들어간다\.\n/);
});

test("짧은 판 시리즈 회상 — 앞 편 구성안 대신 설계안 범위(편끼리 기다리지 않는다, 2026-10-30)", () => {
  const r = P.planRecap({ title: "IP 주소와 네트워크 경계", scope: "IP 주소 체계, NAT", only_here: "서브넷·CIDR 로 경계를 긋는 원리" });
  assert.deepEqual(r, { title: "IP 주소와 네트워크 경계", axis: "서브넷·CIDR 로 경계를 긋는 원리", questions: ["IP 주소 체계, NAT"], fromPlan: true });
  assert.deepEqual(P.planRecap({ title: "제목", scope: "범위", only_here: "" }).questions, [], "only_here 가 비면 범위가 축이고 질문은 비운다");
  const m = P.seriesRecapMaterial({ name: "계층마다 보는 네트워크", no: 6, prev: r }, false)!;
  assert.match(m.claim, /시리즈 5화 "IP 주소와 네트워크 경계"는 이것을 다뤘다: 서브넷·CIDR 로 경계를 긋는 원리/);
  assert.match(m.section, /앞 편 시리즈 설계안의 파이프라인 기록, 소스 아님/);
  const m0 = P.seriesRecapMaterial({ name: "n", no: 2, prev: { title: "t", axis: "a", questions: ["q"] } }, false)!;
  assert.match(m0.section, /앞 편 구성안의 파이프라인 기록/, "일반 시리즈는 종전 문구 그대로");
});
