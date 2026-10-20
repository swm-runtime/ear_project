import { test } from "node:test";
import assert from "node:assert/strict";
import { attributionViolations, v98Violations } from "./draft-two-stage.js";
import { parseScriptForTts } from "../tts/script.js";

// 2026-10-20 국내판 L0 싱크 점검(v9.10 155편 실측): 말끝 쏠림 수정이 격식체로 옮겨 가고, 마무리 claims 검사가 규칙 22("새 claims")보다 넓었다
const script = (body: string, closing: string) =>
  `T000000-000 · 제목 · 경영 · 해설: 이음 / 진행: 윤아 · full-v9.10\n\n## [인트로]\n\n[윤아] Y1 · 안녕하세요.\n\n## [본문]\n\n### #1 구간\n\n${body}\n\n## [마무리]\n\n[윤아] Y90 · 네, 정리해 주세요.\n\n[이음] E90 · ${closing}\n\n[윤아] Y91 · 네, 감사합니다.`;

test("말끝 쏠림 지적은 바꿀 대화체 갈래를 적고 격식체로 바꾸지 말라고 한다 — 넘치는 갈래는 후보에서 뺀다", () => {
  const turns: string[] = [];
  for (let i = 1; i <= 10; i++) turns.push(`[이음] E${i} · 설명 ${i}이에요.`, `[윤아] Y${i + 1} · ${i <= 7 ? "그건 왜 그렇게 되나요?" : "그럼 어떻게 해요?"}`);
  const md = script(turns.join("\n\n"), "정리예요.");
  const v = v98Violations(md, parseScriptForTts(md).turns).find((m) => m.includes("같은 말끝")) ?? "";
  assert.match(v, /대화체 말끝\(~죠·~까요·~다고요\)으로 바꾸고, 격식체\("~습니까\?"·"~합니까\?"\)로는 바꾸지 않는다/);
});

test("마무리 claims 검사 — 본문에서 쓴 claims 를 잇는 것은 통과, 본문에 없던 claim 만 잡는다 (규칙 22)", () => {
  const claimsMd = ["> 축 소스: S1", "| ID | 주장 | 발췌 ID | 유형 | 구간 | 저명 | 의견 | 귀속 |", "|---|---|---|---|---|---|---|---|",
    "| C01 | 가 | S1-01 | 사실 | #1 | 아니오 | 아니오 | 무귀속 |", "| C02 | 나 | S2-01 | 사실 | #1 | 아니오 | 아니오 | 무귀속 |", "| C03 | 다 | S2-02 | 사실 | #1 | 아니오 | 아니오 | 무귀속 |"].join("\n");
  const md = script("[이음] E1 · 가예요.\n\n[윤아] Y2 · 왜요?\n\n[이음] E2 · 나예요.", "가와 나가 이어져요.");
  const turns = parseScriptForTts(md).turns;
  const run = (rows: string[]) => attributionViolations(md, turns, { claimsMd, sourcesMd: "## S1. 매체 — \"글\"", notesMd: ["| 턴 | claims |", "|---|---|", ...rows].join("\n") });
  assert.ok(!run(["| E1 | C01 |", "| E2 | C02 |", "| E90 | C01, C02 |"]).some((m) => m.includes("마무리")));
  assert.match(run(["| E1 | C01 |", "| E2 | C02 |", "| E90 | C01, C03 |"]).join("\n"), /마무리 턴이 본문에서 쓰지 않은 claims 를 씀 \(E90:C03\)/);
});
