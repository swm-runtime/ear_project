import { test } from "node:test";
import assert from "node:assert/strict";
import { twoStageViolations } from "./draft-two-stage.js";

// v9.4 (2026-09-29): 자동화 29편에서 편마다 같은 틀로 나온 정형 문제 — 진행 턴 정리형 비율·각주 질문·"아니라" 대조·사전 문형·끼워 넣기·"○○님이라면"·클로징 다짐형·정리 턴 고정 어미
const wrap = (body: string, closing = "[이음] E9 · 첫째는 이것이었습니다. 둘째가 따라왔죠. 축은 이겁니다.", signoff = "[윤아] Y10 · 네, 감사합니다. 문 앞에 서 있던 그 사람이 오래 남습니다. 이번 이야기 재밌으셨기를 바라며 이만 마치겠습니다.") =>
  `T000000-000 · 제목 · 경제 상식 · 해설: 이음 / 진행: 윤아 · full-v9.4\n\n## [인트로]\n\n[윤아] Y1 · 안녕하세요, 이어 청취자 여러분. 오늘의 주제는 테스트입니다.\n\n## [본문]\n\n### #1 구간\n\n${body}\n\n## [마무리]\n\n[윤아] Y9 · 네, 정리해 주세요.\n\n${closing}\n\n${signoff}`;
const has = (v: string[], re: RegExp) => v.some((m) => re.test(m));
const clean = "[이음] E1 · 내용이에요.\n\n[윤아] Y2 · 왜 그런가요?\n\n[이음] E2 · 이유는 이렇습니다.";

test("L0 v9.4 — 깨끗한 대본은 새 검사에 걸리지 않는다", () => {
  const v = twoStageViolations(wrap(clean), "").filter((m) => /규칙 (3|1|5|16|24|13-1)/.test(m) && /정리형|각주|아니라|사전 정의|끼워|님이라면|다짐형|마지막 문장이/.test(m));
  assert.equal(v.length, 0, v.join("\n"));
});

test("L0 v9.4 — 정리형 진행 턴이 셋 중 하나를 넘으면 잡는다 (본문 진행 턴 12개 이상일 때만)", () => {
  const turns: string[] = [];
  for (let i = 1; i <= 12; i++) turns.push(`[이음] E${i} · 설명 ${i}이에요.`, i <= 6 ? `[윤아] Y${i + 1} · 그러니까 이렇게 된다는 얘기네요.` : `[윤아] Y${i + 1} · 그러면 ${i}은 왜 그런가요?`);
  const v = twoStageViolations(wrap(turns.join("\n\n")), "");
  assert.ok(has(v, /진행 턴 12개 중 6개가 물음표 없는 정리형/), v.join("\n"));
  const few = twoStageViolations(wrap("[이음] E1 · 설명.\n\n[윤아] Y2 · 그렇다는 얘기네요.\n\n[이음] E2 · 설명.\n\n[윤아] Y3 · 그런 뜻이군요."), "");
  assert.ok(!has(few, /정리형/), few.join("\n"));
});

test("L0 v9.4 — 각주 유도 질문·끼워 넣기·역질문 서두", () => {
  const v = twoStageViolations(wrap("[이음] E1 · 조사 결과가 있어요.\n\n[윤아] Y2 · 그 조사의 표본은 얼마나 됐나요?\n\n[이음] E2 · 윤아님이라면 어느 쪽을 고르시겠어요?\n\n[윤아] Y3 · 잠깐, 다른 얘기로 옮겨 보고 싶어요."), "");
  assert.ok(has(v, /각주|표본·척도.*\(Y2\)/), v.join("\n"));
  assert.ok(has(v, /님이라면.*\(E2\)/), v.join("\n"));
  assert.ok(has(v, /잠깐.*\(Y3\)/), v.join("\n"));
});

test("L0 v9.4 — 아니라 대조 7회·사전 문형 3턴", () => {
  const body = Array.from({ length: 7 }, (_, i) => `[이음] E${i + 1} · 이것은 단순한 규칙이 아니라 선택의 문제예요.`).join("\n\n[윤아] Y2 · 네.\n\n");
  const v = twoStageViolations(wrap(body), "");
  assert.ok(has(v, /대조 문장이 7회/), v.join("\n"));
  const gloss = "[이음] E1 · 유동성은 자산을 현금으로 바꿀 수 있는 정도를 뜻해요.\n\n[윤아] Y2 · 네.\n\n[이음] E2 · 만기는 빚을 갚기로 한 날을 말합니다.\n\n[윤아] Y3 · 네.\n\n[이음] E3 · 기대는 앞으로의 가격 예상을 가리켜요.";
  const g = twoStageViolations(wrap(gloss), "");
  assert.ok(has(g, /사전 정의 문형.*\(E1, E2, E3\)/), g.join("\n"));
  const two = twoStageViolations(wrap(gloss.split("\n\n[윤아] Y3")[0]), "");
  assert.ok(!has(two, /사전 정의 문형/), two.join("\n"));
});

test("L0 v9.4 — 클로징 다짐형과 정리 턴 고정 어미", () => {
  const v = twoStageViolations(wrap(clean, "[이음] E9 · 첫째는 이것이었습니다. 그래서 둘째가 따라왔죠. 결국 조건을 함께 봐야 한다는 점을 이해하게 됩니다.", "[윤아] Y10 · 네, 감사합니다. 저도 다음에 물가 숫자를 볼 때 그 안의 경로를 떠올려 보겠습니다. 이번 이야기 재밌으셨기를 바라며 이만 마치겠습니다."), "");
  assert.ok(has(v, /다짐형/), v.join("\n"));
  assert.ok(has(v, /마지막 문장이 "결국"으로 시작·"~을 이해하게 됩니다"로 끝남/), v.join("\n"));
  const ok = twoStageViolations(wrap(clean), "");
  assert.ok(!has(ok, /다짐형|마지막 문장이/), ok.join("\n"));
});
