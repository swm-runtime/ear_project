import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCriticReport, parseCriticScores } from "./artifacts";

// 2026-10-15 KAN-201 — 글로벌판 비평 리포트(critic-en, 영어 머리·열 이름)를 판정 화면이 한국판과 같은 구조로 읽는다
const EN = `# Critic report — G261015-001
> critic-en · 2026-10-15

## 1. Scores
| Axis | Item | Score | Evidence (turn + quote) | Human score | Human reason |
|---|---|---|---|---|---|
| Content | 3.1 Value and depth | **8**/12 | [E12] "Families trade labor" | | |
| Naturalness | 3.8 Spoken English | 9/12 | [E3] "It's called kimjang" | | |
| **Total** | | **71/100** | | | |

## 2. Flags
| # | Turn | Item | Severity | Note (quote) | Verdict (human) | Reason |
|---|---|---|---|---|---|---|
| 1 | Y4 | F2 Stock reactions | violation | "Exactly!" | | |
| 2 | E9 | E1 Default viewpoint | suspect | "Unlike in the West" | | |

## 3. ⭐ Strengths
| # | Turn | What works | Verdict (human) |
|---|---|---|---|
| 1 | Y11 | The host's guess changes E12 | |

## 4. Tally
Flags 2 · violations 1 · suspects 1 · ⭐ 1
`;

test("영어 비평 리포트 — 플래그·⭐·강도(위반·의심으로)·점수표·합계를 읽는다", () => {
  const r = parseCriticReport(EN);
  assert.deepEqual(r.flags, [
    { n: "1", where: "Y4", item: "F2 Stock reactions", strength: "위반", note: "\"Exactly!\"" },
    { n: "2", where: "E9", item: "E1 Default viewpoint", strength: "의심", note: "\"Unlike in the West\"" },
  ]);
  assert.deepEqual(r.stars, [{ n: "1", where: "Y11", item: "⭐", strength: undefined, note: "The host's guess changes E12" }]);
  const s = parseCriticScores(EN);
  assert.equal(s.total, "71/100");
  assert.deepEqual(s.rows.map((x) => [x.key, x.axis, x.item, x.ai, x.max]), [["3.1", "Content", "Value and depth", 8, 12], ["3.8", "Naturalness", "Spoken English", 9, 12]]);
});

test("정렬 구분선·볼드 항목 셀이 있어도 점수표 키를 읽는다", () => {
  const md = "## 1. Scores\n| Axis | Item | Score | Evidence |\n|:---|:---|---:|---|\n| Content | **3.2 Argument and support** | 6/8 | [E3] \"x\" |\n## 2. Flags\n";
  assert.deepEqual(parseCriticScores(md).rows.map((x) => [x.key, x.item, x.ai]), [["3.2", "Argument and support", 6]]);
});

test("한국판 리포트는 종전 그대로 읽는다", () => {
  const KO = "## 2. 플래그\n| # | 턴 | 항목 | 강도 | 지적 (자구 인용) | 판정(사람) | 사유 |\n|---|---|---|---|---|---|---|\n| 1 | Y3 | A1 유도 질문 | 위반 | \"…\" | | |\n";
  assert.deepEqual(parseCriticReport(KO).flags, [{ n: "1", where: "Y3", item: "A1 유도 질문", strength: "위반", note: "\"…\"" }]);
});
