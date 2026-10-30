import { test } from "node:test";
import assert from "node:assert/strict";
import { twoStageViolations } from "./draft-two-stage.js";

// 구간 전환 선언 검사 (규칙 1) — 2026-10-30 네트워크 짧은 판 6·7화: 패킷이 "다음으로 넘어가요"가 전환 선언으로 잡혀 L0 재시도 3회를 수정 0건으로 소진했다
const handoffOf = (text: string) => twoStageViolations(`[이음] E4 · ${text}`, "").find((v) => /구간 전환을 선언함/.test(v));

test("구간 전환 선언 — 문장 안의 '다음으로 넘어가'(패킷 전달 등)는 내용이라 잡지 않는다", () => {
  assert.equal(handoffOf("TTL은 라우터를 거쳐 넘어가는 횟수를 제한해요. 라우터를 거쳐 다음으로 넘어가는 전달 단계를 홉이라고 불러요."), undefined);
  assert.equal(handoffOf("기본 경로는 표에 있을 때 적용해요. 서버행 패킷도 각 장치에서 이런 선택을 거쳐 다음으로 넘어가요."), undefined);
});

test("구간 전환 선언 — 문장 첫머리의 '다음으로 넘어가'와 '다음 질문은 이거'는 잡고, 걸린 대목을 지적에 적는다", () => {
  assert.match(handoffOf("여기까지가 첫 질문의 답이에요. 그럼 다음으로 넘어가 볼게요.") ?? "", /E4 "그럼 다음으로 넘어가"/);
  assert.match(handoffOf("다음으로 넘어가 보죠. 표는 어떻게 만들어질까요?") ?? "", /E4 "다음으로 넘어가"/);
  assert.match(handoffOf("좋아요. 이제, 다음으로 넘어가면 이런 문제가 있어요.") ?? "", /E4 "이제, 다음으로 넘어가"/);
  assert.match(handoffOf("자 그럼 다음 질문은 이거예요. 왜 표가 필요할까요?") ?? "", /E4 "다음 질문은 이거"/);
});
