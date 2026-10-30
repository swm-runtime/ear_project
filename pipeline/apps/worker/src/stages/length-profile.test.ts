import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "@ear/pipeline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { twoStageViolations } from "./draft-two-stage.js";

const SKILLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../docs/ai/skills");
const rules = P.parseShortRules(P.promptBody(fs.readFileSync(path.join(SKILLS, "draft/short.md"), "utf8")), "short-v1");
const rubricShort = P.promptBody(fs.readFileSync(path.join(SKILLS, "critic/rubric-short.md"), "utf8"));

// 0040 (KAN-296, 2026-10-29) — 길이 프로필. standard 경로는 프롬프트·검사가 글자 하나 바뀌지 않고, short 에만 블록·수치가 붙는다
const cand = { id: "C1", mid_topic: "경제 상식", title: "제목", target_fit: null, angle: null, sources: [{ url: "https://a.example/1", title: "t", publisher: "p" }] };
const design = (extra: Record<string, unknown>) => P.buildDesignPromptInlineParts({ episodeId: "T1", candidate: { ...cand, ...extra }, promptVersion: "full-v9.11", guidelines: "g", specScript: "s", goldFullEum: "", goldFullYuna: "", sources: [] });
const write = (extra: Record<string, unknown>) => P.buildWritePromptParts({ episodeId: "T1", candidate: { ...cand, ...extra }, introStyle: P.INTRO_STYLES[0], promptVersion: "full-v9.11", guidelines: "g", specScript: "s", goldFullEum: "", goldFullYuna: "", sourcesMd: "", claimsMd: "", outlineMd: "", pronunciationsJson: "{}" });

test("길이 프로필 — standard·null·모르는 값은 설계·대본 프롬프트가 종전과 같다", () => {
  const base = design({});
  assert.equal(design({ length_profile: "standard" }).user, base.user);
  assert.equal(design({ length_profile: null }).user, base.user);
  assert.equal(design({ length_profile: "weird" }).user, base.user);
  assert.doesNotMatch(base.user, /짧은 판/);
  const w = write({});
  assert.equal(write({ length_profile: "standard" }).user, w.user);
  assert.doesNotMatch(w.user, /짧은 판|선취 훅/);
  assert.match(w.user, /하한 13분/);
});

test("길이 프로필 — short 는 설계·대본에 숫자 줄(코드)과 짧은 판 규칙 자산 절이, 비평에 짧은 판 루브릭이 붙는다", () => {
  const d = P.buildDesignPromptInlineParts({ episodeId: "T1", candidate: { ...cand, length_profile: "short", remake_of: "C0" }, promptVersion: "v", guidelines: "g", specScript: "s", goldFullEum: "", goldFullYuna: "", sources: [], remakeOf: { title: "원본 제목", axis: "A인데 B" }, shortRules: rules });
  assert.ok(d.user.startsWith("**이 편은 짧은 판이다"), "짧은 판 표지가 설계 프롬프트 맨 앞에 온다");
  assert.match(d.user, /## 짧은 판 — .*short-v1/);
  assert.match(d.user, /본문 구간은 2~3개/);
  assert.match(d.user, /사용 소스 하한은 2건/);
  assert.match(d.user, /상한 12분/);
  assert.match(d.user, /"원본 제목"의 짧은 판/);
  assert.match(d.user, /원본의 축: A인데 B/);
  assert.match(d.user, /축 소스는 모든 구간에 배정할 수 있다/, "자산의 설계 절");
  assert.doesNotMatch(d.user, /도입 훅 — /, "훅을 받지 않으면 훅 절은 설계에 붙지 않는다");
  assert.match(d.user, /"도입 훅:" 줄을 둔다/, "자산의 설계 절 — 구성안이 훅 재료와 첫 구간을 정한다(short-v1.2)");
  const dh = P.buildDesignPromptInlineParts({ episodeId: "T1", candidate: { ...cand, id: "C601", length_profile: "short" }, promptVersion: "v", guidelines: "g", specScript: "s", goldFullEum: "", goldFullYuna: "", sources: [], shortRules: rules, shortHook: P.shortHookFor("C601") });
  assert.match(dh.user, /### 이 편의 도입 훅 — 약속형/, "설계가 이 편의 훅 형태와 규칙을 본다");
  assert.match(dh.user, /실제로 겪는 상황 하나/);
  assert.match(dh.user, /청취자 장면은 그 claim 의 결과가 청취자에게 보이거나 청취자가 겪는 일이다/, "설계가 청취자 장면을 정한다(short-v1.3)");
  assert.doesNotMatch(dh.user, /도입 훅 — 선취형/, "다른 형태의 훅 절은 붙지 않는다");
  assert.throws(() => P.buildDesignPromptInlineParts({ episodeId: "T1", candidate: { ...cand, length_profile: "short" }, promptVersion: "v", guidelines: "g", specScript: "s", goldFullEum: "", goldFullYuna: "", sources: [] }), /짧은 판 규칙/);
  assert.match(P.shortTrimFeedback(16, 5), /예상 16분 · 본문 구간 5개/);
  const wr = (hook?: P.ShortHook) => P.buildWritePromptParts({ episodeId: "T1", candidate: { ...cand, length_profile: "short" }, introStyle: P.INTRO_STYLES[0], promptVersion: "v", guidelines: "g", specScript: "s", goldFullEum: "", goldFullYuna: "", sourcesMd: "", claimsMd: "", outlineMd: "", pronunciationsJson: "{}", shortHook: hook, shortRules: rules });
  const w = wr();
  assert.match(w.user, /선취형 훅/);
  assert.match(w.user, /### 도입 훅 — 선취형/);
  assert.match(w.user, /수치는 결과에 필요할 때만 넣고 2개 이하다/, "선취형은 수치 대신 의외성·중요성(short-v1.2)");
  assert.match(w.user, /청취자가 이미 아는 사실, 구성 요소의 개수, 절차의 횟수는 결과가 아니다/);
  assert.match(w.user, /앞 편 회상 한 문장으로 시작한다. 회상 바로 다음 문장이 훅이다/, "시리즈 2화부터 회상 뒤 훅 — 훅 턴 위치는 1화와 같다");
  assert.doesNotMatch(w.user, /### 도입 훅 — 약속형/);
  assert.doesNotMatch(w.user, /진입 방식: \*\*/, "short 편은 진입 방식 로테이션 줄이 빠진다");
  assert.match(w.user, /상한 12분\(약 4,100자\)/);
  assert.match(w.user, /골드 예시는 말투와 주고받기만 따른다/, "자산의 대본 절");
  const w2 = wr(P.pickShortHook(1));
  assert.match(w2.user, /### 도입 훅 — 약속형/);
  assert.match(w2.user, /실제로 겪는 상황 하나/);
  assert.match(w2.user, /판단·생각·이해가 바뀌는 것은 결과가 아니다/);
  assert.match(w2.user, /문장의 주어는 청취자다/);
  assert.match(w2.user, /훅 문장은 청취자가 보거나 겪는 일을 말한다/, "훅은 장치 안의 동작이 아니라 청취자 장면(short-v1.3)");
  assert.equal(P.pickShortHook(600).key, "payoff"); assert.equal(P.pickShortHook(601).key, "promise");
  assert.equal(P.shortHookFor("C600").key, "payoff"); assert.equal(P.shortHookFor("C601").key, "promise", "설계·대본이 같은 훅을 쓴다");
  const c = P.buildCriticPromptInlineParts({ episodeId: "T1", title: "t", midTopic: "경제 상식" as never, rubricV2Md: "r", guidelines: "g", goldFullEum: "", goldFullYuna: "", scriptMd: "s", lengthProfile: "short", rubricShortMd: rubricShort });
  assert.match(c.system, /## 짧은 판 채점 — 위 1절 비평 루브릭 v2 의 3장\(점수\) 대신/);
  assert.match(c.system, /3\.5 첫 30초 \(10\)/);
  const cNoRubric = P.buildCriticPromptInlineParts({ episodeId: "T1", title: "t", midTopic: "경제 상식" as never, rubricV2Md: "r", guidelines: "g", goldFullEum: "", goldFullYuna: "", scriptMd: "s", lengthProfile: "short" });
  assert.match(cNoRubric.system, /규격 알림 — 짧은 판/);
  const c0 = P.buildCriticPromptInlineParts({ episodeId: "T1", title: "t", midTopic: "경제 상식" as never, rubricV2Md: "r", guidelines: "g", goldFullEum: "", goldFullYuna: "", scriptMd: "s" });
  assert.doesNotMatch(c0.system, /짧은 판/);
});

test("짧은 판 규칙 자산 — 절이 빠지면 멈춘다 · 루브릭 배점 합 100", () => {
  assert.throws(() => P.parseShortRules("## 설계\n- a\n## 대본\n- b", "short-v0"), /도입 훅 — 선취형/);
  const pts = [...rubricShort.matchAll(/^## 3\.\d+ [^(]+\((\d+)\)/gm)].map((m) => Number(m[1]));
  assert.equal(pts.length, 12);
  assert.equal(pts.reduce((a, b) => a + b, 0), 100);
  const ax = P.SHORT_CRITIC_AXIS_MAX; assert.equal(ax.content + ax.structure + ax.naturalness + ax.immersion + ax.persona, 100);
});

test("L0 분량 — standard 는 4,300자 하한 그대로, short 는 1,700자 하한·4,100자 상한", () => {
  const turn = (n: number) => `[이음] E1 · ${"가".repeat(n)}`;
  const std = twoStageViolations(turn(2000), "");
  assert.ok(std.some((v) => /하한 13분\(약 4,300자\)/.test(v)), std.join("|"));
  const shortOk = twoStageViolations(turn(2000), "", { lengthProfile: "short" });
  assert.ok(!shortOk.some((v) => /하한/.test(v)), shortOk.join("|"));
  const shortLow = twoStageViolations(turn(1000), "", { lengthProfile: "short" });
  assert.ok(shortLow.some((v) => /하한 5분\(약 1,700자\)/.test(v)), shortLow.join("|"));
  const shortHigh = twoStageViolations(turn(5000), "", { lengthProfile: "short" });
  assert.ok(shortHigh.some((v) => /상한 12분\(약 4,100자\) 초과/.test(v)), shortHigh.join("|"));
  const stdHigh = twoStageViolations(turn(5000), "");
  assert.ok(!stdHigh.some((v) => /상한/.test(v)), "standard 에는 글자 상한이 없다");
});

test("lengthSpecOf — short 규격 수치", () => {
  const s = P.lengthSpecOf("short");
  assert.deepEqual([s.floorMin, s.targetMin, s.maxMin, s.floorChars, s.maxChars, [...s.sections], s.minSources], [5, 9, 12, 1700, 4100, [2, 3], 2]);
  assert.equal(P.lengthSpecOf("standard").minSources, 3);
  assert.equal(P.lengthSpecOf(null).key, "standard");
});
