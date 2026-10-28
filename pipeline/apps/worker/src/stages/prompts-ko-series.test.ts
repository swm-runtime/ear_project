import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "@ear/pipeline";

// 2026-10-28 — 한국판 QA 도 시리즈 틀 문장을 받는다(글로벌 qa-en-v0.12 와 같은 절). 단일 편은 절이 없다
test("한국판 QA 프롬프트 — 시리즈 편은 틀 문장 절(인트로 줄·회상·클로징 예고)을 넣고, 단일 편은 넣지 않는다", () => {
  const base = { episodeId: "S1", attempt: 1, qaPromptMd: "# QA", specQaMd: "# spec", scriptMd: "s", claimsMd: "c", sourcesMd: "x" };
  const ps = P.buildQaPromptInlineParts({ ...base, seriesFrames: { name: "사례로 알아보는 창업", no: 4, total: 9, introSentence: "사례로 알아보는 창업 네 번째 시간입니다.", closingSentence: "다음 시간에는 '피벗'에 대해 이야기합니다.", recapClaimId: "C33", prevTitle: "최소 기능 제품" } });
  assert.match(ps.user, /### 시리즈 틀 문장/);
  assert.match(ps.user, /9편 중 4화/);
  assert.match(ps.user, /회상: 도입의 첫 해설 턴이 3화 "최소 기능 제품"/);
  assert.match(ps.user, /다음 시간에는 '피벗'에 대해 이야기합니다/);
  assert.match(ps.user, /사실 주장이 아니라 틀이다/);
  const single = P.buildQaPromptInlineParts(base);
  assert.doesNotMatch(single.user, /시리즈 틀 문장/);
  const first = P.buildQaPromptInlineParts({ ...base, seriesFrames: { name: "S", no: 1, total: 3, introSentence: "i", closingSentence: "c", recapClaimId: null, prevTitle: null } });
  assert.doesNotMatch(first.user, /회상:/, "1화는 회상 줄이 없다");
});
