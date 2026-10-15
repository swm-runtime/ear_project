import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { twoStageViolations, scriptStats, l0Next, L0_FIX_MAX } = await import("./draft-two-stage.js");
const { formatViolations } = await import("./draft.js");
const { sectionKind } = await import("../tts/sections.js");
const { countWords, MIN_WORDS_EN } = await import("../script-length.js");

// 2026-10-15 KAN-203 — 글로벌판 L0 는 형식 계약(구역 헤더·구성안 구간·단어 분량·마지막 턴)만 본다. 한국어 문체 검사는 돌지 않는다
const saved = { locale: process.env.PIPELINE_LOCALE, speakers: process.env.PIPELINE_SPEAKERS };
afterEach(() => {
  if (saved.locale === undefined) delete process.env.PIPELINE_LOCALE; else process.env.PIPELINE_LOCALE = saved.locale;
  if (saved.speakers === undefined) delete process.env.PIPELINE_SPEAKERS; else process.env.PIPELINE_SPEAKERS = saved.speakers;
});
const en = () => { process.env.PIPELINE_LOCALE = "en"; process.env.PIPELINE_SPEAKERS = "Mina,Alex"; };

const SIGNOFF = "That's all for today on ear";
const OUTLINE = ["# outline", "Estimated length: 15 min", "", "Section #1 — Where kimchi starts", "Section #2 — Chili arrives", "Section #3 — Kimjang as a shared job"].join("\n");
// 본문 해설 턴 — 분량을 채우는 데 쓴다. 한 턴 8문장: 한국판 L0 라면 "해설 턴 7문장 이상"으로 걸린다
const LONG_E = "Kimjang is the late-autumn job of making a winter's worth of kimchi in one go. Families split the work by hand. One group salts the cabbage overnight. Another grinds the seasoning paste. Neighbors trade labor, so each house gets help in turn. The cabbage is packed into jars by the afternoon. Some of it is shared with relatives who could not come. UNESCO listed the practice in 2013 as intangible heritage.";
function script(o: { zones?: string[]; sections?: number[]; bodyTurns?: number; lastTurn?: string } = {}) {
  const z = o.zones ?? ["Intro", "Opening", "Body", "Closing"];
  const sections = o.sections ?? [1, 2, 3];
  const per = Math.ceil((o.bodyTurns ?? 27) / sections.length);
  let e = 1, y = 1;
  const E = (t: string) => `[Mina] E${e++} · ${t}`;
  const Y = (t: string) => `[Alex] Y${y++} · ${t}`;
  const lines = ["Kimchi before chili — a 15-minute look at kimjang", "", `## [${z[0]}]`, Y("Welcome to ear. Today we're looking at kimjang, the big kimchi-making day."), E("Hi, I'm Mina. I grew up helping with it every November.")];
  lines.push("", `## [${z[1]}]`, Y("So what is kimjang, exactly?"), E("It's the day a household makes its winter kimchi, all at once."));
  lines.push("", `## [${z[2]}]`);
  for (const n of sections) {
    lines.push(`### #${n} Part ${n}`);
    for (let i = 0; i < per; i++) { lines.push(Y("How did that work in practice?"), E(LONG_E)); }
  }
  lines.push("", `## [${z[3]}]`, E("Kimjang turns a hard seasonal job into a shared one. The work is split. The food is shared. That is why it lasted."));
  lines.push(o.lastTurn ?? Y(`${SIGNOFF}. Thanks for listening, and see you next time.`));
  return lines.join("\n");
}

test("형식 계약을 지킨 영어 대본은 위반이 없고, 한국어 문체 검사(해설 턴 7문장 이상 등)는 돌지 않는다", () => {
  en();
  const md = script();
  assert.ok(scriptStats(md).words! >= MIN_WORDS_EN, `표본 분량 ${scriptStats(md).words}단어`);
  assert.deepEqual(twoStageViolations(md, OUTLINE, { signoffHeads: [SIGNOFF], claimsMd: "", sourcesMd: "" }), []);
  assert.deepEqual(formatViolations(md), []);
});

test("구역 헤더가 빠지거나 순서가 다르면 막는다", () => {
  en();
  assert.match(twoStageViolations(script({ zones: ["Intro", "Body", "Opening", "Closing"] }), OUTLINE).join(), /exactly four zones, in this order: ## \[Intro\] → ## \[Opening\] → ## \[Body\] → ## \[Closing\]/);
  assert.match(twoStageViolations(script({ zones: ["인트로", "도입", "본문", "마무리"] }), OUTLINE).join(), /Zone headers are \[인트로\]/);
});

test("구성안의 Section #n 과 대본의 ### #n 이 수·순서가 다르면 막는다", () => {
  en();
  assert.match(twoStageViolations(script({ sections: [1, 2] }), OUTLINE).join(), /outline has 3 sections but the script has 2/);
  assert.match(twoStageViolations(script({ sections: [1, 3, 2] }), OUTLINE).join(), /order differs from the outline \(outline 1,2,3 \/ script 1,3,2\)/);
});

test("분량은 단어로 센다 — 13분 하한(1,950단어) 미달·구성안 예상의 1.6배 초과를 막는다", () => {
  en();
  const short = script({ bodyTurns: 6 });
  assert.match(twoStageViolations(short, OUTLINE).join(), new RegExp(`Length ${scriptStats(short).words} words .* below the 13-minute floor \\(1950 words\\)`));
  const long = script({ bodyTurns: 60 });
  assert.match(twoStageViolations(long, OUTLINE.replace("15 min", "8 min")).join(), /more than 1\.6× the outline estimate of 8 min/);
});

test("마지막 턴은 진행(Y) 턴이고 클로징 머리 문구를 담아야 한다", () => {
  en();
  assert.match(twoStageViolations(script({ lastTurn: "[Mina] E99 · Bye." }), OUTLINE, { signoffHeads: [SIGNOFF] }).join(), /last turn is not a host \(Y\) turn \(E99\)/);
  assert.match(twoStageViolations(script({ lastTurn: "[Alex] Y99 · Okay, bye now." }), OUTLINE, { signoffHeads: [SIGNOFF, "Thanks for joining {name}"] }).join(), /Y99 lacks the sign-off frame \("That's all for today on ear" or 1 other\)/);
});

test("영어 위반은 비율 규칙이 아니라 L0 한도 뒤에 남으면 실패다", () => {
  en();
  const v = twoStageViolations(script({ bodyTurns: 6 }), OUTLINE);
  assert.deepEqual(l0Next(v, L0_FIX_MAX), { action: "fail", hard: v });
});

test("줄 문법 검사 — 턴이 10개 미만이면 영어 메시지로 막는다", () => {
  en();
  assert.match(formatViolations("## [Intro]\n[Alex] Y1 · Hi.").join(), /Only 1 turns parsed — every spoken line follows "\[Mina\] E1 · sentence"/);
});

test("분량 통계 — 글로벌판은 words 와 단어 ÷ 150 분, 한국판은 종전 그대로 words 키가 없다", () => {
  en();
  const s = scriptStats("## [Body]\n[Mina] E1 · Don't call it K-pop yet — it's 1992.\n[Alex] Y1 · Okay.");
  assert.equal(s.words, 8); // Don't · call · it · K-pop · yet · it's · 1992 · Okay
  assert.equal(s.minutes, Math.round((8 / 150) * 10) / 10);
  assert.equal(countWords("KRW 2,000 won"), 4);
  delete process.env.PIPELINE_LOCALE;
  assert.deepEqual(Object.keys(scriptStats("## [본문]\n[윤아] E1 · 안녕하세요.")), ["turns", "chars", "minutes"]);
});

test("구역 → 카드 구분 — 글로벌판 [Intro]·[Opening]·[Body]·[Closing], 한국판 이름은 en 에서 body", () => {
  en();
  assert.deepEqual(["Intro", "Opening", "Body", "Closing", "마무리"].map(sectionKind), ["intro", "lead", "body", "outro", "body"]);
  delete process.env.PIPELINE_LOCALE;
  assert.deepEqual(["인트로", "도입", "본문", "마무리", "Closing"].map(sectionKind), ["intro", "lead", "body", "outro", "body"]);
});
