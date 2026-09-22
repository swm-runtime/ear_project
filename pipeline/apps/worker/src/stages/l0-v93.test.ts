import { test } from "node:test";
import assert from "node:assert/strict";
import { twoStageViolations } from "./draft-two-stage.js";

const wrap = (body: string) => `T000000-000 · 제목 · 경제 상식 · 해설: 이음 / 진행: 윤아 · full-v9.3\n\n## [인트로]\n\n[윤아] Y1 · 안녕하세요, 이어 청취자 여러분. 오늘의 주제는 테스트입니다.\n\n## [본문]\n\n### #1 구간\n\n${body}\n\n## [마무리]\n\n[윤아] Y9 · 네, 정리해 주세요.\n\n[이음] E9 · 첫째는 이것이었습니다. 그래서 둘째가 따라왔죠. 결국 축은 이겁니다.\n\n[윤아] Y10 · 네, 감사합니다. 이번 이야기 재밌으셨기를 바라며 이만 마치겠습니다.`;
const has = (v: string[], re: RegExp) => v.some((m) => re.test(m));

test("L0 v9.3 — 표본 수·편수 낭독을 잡는다", () => {
  const v = twoStageViolations(wrap("[이음] E1 · 참가자 384명에게 상황을 보여 줬어요.\n\n[윤아] Y2 · 그래서요?\n\n[이음] E2 · 이 문제를 다룬 17개 연구를 모아 살핀 글도 있습니다."), "");
  assert.ok(has(v, /표본 수·편수·조사 횟수·인용 관계를 낭독 \(E1, E2\)/), v.join("\n"));
  const ok = twoStageViolations(wrap("[이음] E1 · 참가자들에게 상황을 보여 줬어요. 관계가 가까울수록 신고가 줄었습니다."), "");
  assert.ok(!has(ok, /표본 수/), ok.join("\n"));
});

test("L0 v9.3 — 한 턴 수치 5개 이상, 주어형 귀속 4턴, 정리 턴 1문장", () => {
  const v = twoStageViolations(wrap("[이음] E1 · 자유가 37.0%, 원하는 일 29.1%, 돈 18.9%, 자금 38.7%, 정보 37.5%였어요.\n\n[윤아] Y2 · 네.\n\n[이음] E2 · 이 글은 거절이 핵심이라고 해요.\n\n[윤아] Y3 · 네.\n\n[이음] E3 · 저자는 시간 부채를 말합니다.\n\n[윤아] Y4 · 네.\n\n[이음] E4 · 연구진은 그렇게 봤어요.\n\n[윤아] Y5 · 네.\n\n[이음] E5 · 이 연구에서는 그 관계가 약했습니다."), "");
  assert.ok(has(v, /수치가 5개 이상 \(E1: 5개\)/), v.join("\n"));
  assert.ok(has(v, /주어형 귀속.*\(E2, E3, E4, E5\)/), v.join("\n"));
  const short = twoStageViolations(wrap("[이음] E1 · 내용이에요.").replace("첫째는 이것이었습니다. 그래서 둘째가 따라왔죠. 결국 축은 이겁니다.", "결국 축은 이겁니다."), "");
  assert.ok(has(short, /마무리 정리 턴 E9 이 1문장/), short.join("\n"));
});
