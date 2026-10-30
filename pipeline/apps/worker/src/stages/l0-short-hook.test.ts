import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "@ear/pipeline";
import { twoStageViolations, shortPreviewFix, isRatioViolation } from "./draft-two-stage.js";
import { foreignScriptFields } from "./design-single.js";

// 짧은 판 훅 지키기 (2026-10-30) — v1.4 약속형 10편 전부 "여러분" 시작 · v1.5 2화는 수정 단계가 약속을 질문형 도입으로 덮어씀 · 12화는 두 문장
const script = (e1: string) => `## [인트로]\n[윤아] Y1 · 안녕하세요.\n## [도입]\n[이음] E1 · ${e1}\n[윤아] Y2 · 어떻게 가능해요?\n## [본문]\n### #1\n[이음] E2 · 표에서 목적지에 맞는 항목을 찾아요. 가장 구체적인 항목을 골라요.\n`;
const promise = (e1: string, seriesNo: number | null = 6) => twoStageViolations(script(e1), "", { lengthProfile: "short", shortHook: { key: "promise" }, seriesNo }).filter((v) => v.startsWith("짧은 판 약속형:"));

test("짧은 판 약속형 — 회상 한 문장 뒤 '이번 편 …' 한 문장은 통과", () => {
  assert.deepEqual(promise("앞 편에서는 IP 주소 체계를 다뤘어요. 이번 편의 라우팅 테이블과 최장 접두사 일치를 따라가면, 전달 표를 펼쳤을 때 목적지에 맞는 항목을 고를 수 있어요."), []);
  assert.deepEqual(promise("이번 편의 현금흐름 설계를 듣고 나면, 월급이 끊겼을 때 생활비 기준으로 돈의 배치를 정할 수 있어요.", null), [], "단편은 회상 없이 첫 문장이 약속");
});

test("짧은 판 약속형 — '여러분' 시작·이번 편 없음·두 문장을 잡는다(한도 뒤엔 QA 로 넘기는 말맛 위반)", () => {
  const a = promise("앞 편에서는 OSI 계층을 다뤘어요. 청취자 여러분은 와이파이에 연결할 때 대역을 고를 수 있어요.");
  assert.equal(a.length, 1); assert.match(a[0], /"여러분"으로 시작 \(E1\)/);
  assert.ok(a.every(isRatioViolation), "초안을 멈추지 않는다");
  assert.match(promise("앞 편에서는 OSI 계층을 다뤘어요. 와이파이 연결을 고를 때 궁금해질 수 있어요.")[0], /이번 편을 가리키는 말로 시작하지 않음/);
  const wrongOrder = promise("앞 편에서는 세션을 구별했어요. 상대가 읽을 형식을 골라 파일을 주고받을 수 있어요. 이번 편에서는 문자 인코딩을 살펴볼 거예요.");
  assert.equal(wrongOrder.length, 1, "순서가 틀리면(약속이 먼저, 이번 편이 뒤) 시작 위반 하나");
  assert.match(wrongOrder[0], /이번 편을 가리키는 말로 시작하지 않음/);
  assert.deepEqual(promise("이번 편의 이자 부담과 보험사 운용수익을 따라가면, 금리 인상 뉴스에서 돈을 내는 쪽과 받는 쪽을 구별해 읽을 수 있어요. 대출 부담과 수익 기회를 함께 놓고 보는 거예요.", null), [], "약속 문장 + 풀어 주는 문장 하나는 통과(short-v1.6)");
  const three = promise("이번 편의 쿠키를 따라가면 언어 설정을 지킬 수 있어요. 첫째 문장이에요. 둘째 문장이에요.", null);
  assert.ok(three.some((v) => /약속 부분이 3문장/.test(v)), three.join(" | "));
});

test("짧은 판 약속형 검사는 약속형·짧은 판에만 — 선취형·일반 편은 그대로", () => {
  const e1 = "앞 편에서는 OSI 계층을 다뤘어요. 청취자 여러분은 와이파이를 고를 수 있어요.";
  assert.equal(twoStageViolations(script(e1), "", { lengthProfile: "short", shortHook: { key: "payoff" }, seriesNo: 6 }).filter((v) => v.startsWith("짧은 판 약속형:")).length, 0);
  assert.equal(twoStageViolations(script(e1), "").filter((v) => v.startsWith("짧은 판 약속형:")).length, 0);
});

test("짧은 판 도입 구분 예고 — 질문형 도입 안내 대신 훅은 두고 표현만 빼라", () => {
  const m = '도입 턴 1개가 답의 틀을 미리 말함 (E1) — 도입에서 구분을 예고하지 않는다. "나눠 보자" 대신 청취자가 처음 품을 질문 하나로 열고, 구분은 본문의 결과로 드러나게 한다 (규칙 13)';
  const s = shortPreviewFix(m);
  assert.doesNotMatch(s, /질문 하나로 열고/);
  assert.match(s, /훅 문장\(선취형의 결과·약속형의 약속\)은 그대로 두고/);
  assert.ok(isRatioViolation(s), "표지(도입에서 구분을 예고하지 않는다)는 남는다");
  assert.equal(shortPreviewFix("다른 지적"), "다른 지적");
});

test("수정 단계 프롬프트 — 짧은 판 규칙 블록이 들어간다", () => {
  const base = { episodeId: "S1", attempt: 2, qaFailures: [{ location: "E1", item: "L0", reason: "x" }], guidelines: "g", scriptMd: "s", claimsMd: "c", sourcesMd: "so", pronunciationsJson: "{}" };
  assert.doesNotMatch(P.buildRevisionPromptInlineParts(base).user, /짧은 판/);
  const u = P.buildRevisionPromptInlineParts({ ...base, shortBlock: "\n\n## 짧은 판 — 규칙\n### 도입 훅 — 약속형\n- 약속 문장은 이번 편을 가리키는 말로 시작한다." }).user;
  assert.match(u, /이 편은 짧은 판이다 — 고친 턴도 아래 규칙을 지킨다/);
  assert.match(u, /### 도입 훅 — 약속형/);
  assert.ok(u.indexOf("도입 훅 — 약속형") < u.indexOf("## 지적 사항"), "지적 사항보다 앞");
});

test("설계 언어 검사 — 축·claims·구성안의 한자·가나 네 자 이상", () => {
  assert.deepEqual(foreignScriptFields({ axis: "数据表示与对话管理不是必须分别安装的两个部件", outline_md: "축: ok", claims: [{ text: "한국어" }] }), ["축"]);
  assert.deepEqual(foreignScriptFields({ axis: "물리 계층은 신호를 읽는 약속이다", outline_md: "구간 #1 — 提供された本文は", claims: [{ text: "ok" }, { text: "暗号化に用いる" }] }), ["claims", "구성안"]);
  assert.deepEqual(foreignScriptFields({ axis: "UTF-8 은 字 하나를 여러 바이트로", outline_md: "", claims: [] }), [], "한두 자는 걸리지 않는다");
});
