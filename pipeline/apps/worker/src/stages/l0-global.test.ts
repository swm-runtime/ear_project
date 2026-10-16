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
// 본문 턴 — 분량을 채우는 데 쓴다. 첫마디가 턴마다 다르고(문체 L0 첫마디 반복), 해설은 6문장(문장 수 상한), 진행은 질문 60%(질문 비율 절반~3분의 2)
const NOUNS = ["Cabbage", "Salt", "Neighbors", "Grandmothers", "Jars", "Radish", "Garlic", "Pepper", "Courtyards", "Rubber gloves", "Basins", "Fish sauce", "Ginger", "Scallions", "Buckets", "Children", "Aprons", "Rice flour", "Shrimp", "Pears", "Onions", "Mats", "Ladles", "Lids", "Cousins", "Kitchens", "Rooftops", "Cellars", "Knives", "Towels"];
const HOST = ["Who decides", "Where does", "Which part", "When do", "Does everyone", "Is there", "Can a family", "What happens", "Would a", "Why would", "Was that", "Could one", "Do they", "How long", "Are the"];
const REACT = ["I can picture", "That would tire", "I'd guess", "My hunch is", "I'd find", "It sounds"];
const LONG_E = (noun: string) => `${noun} matter a lot in this part of the work. Families split the job by hand over two days. One group salts the cabbage overnight in large tubs. Another group grinds the seasoning paste in the morning. Neighbors trade labor, so each house gets help in turn. By the afternoon the jars are packed and shared with relatives.`;
function script(o: { zones?: string[]; sections?: number[]; bodyTurns?: number; lastTurn?: string } = {}) {
  const z = o.zones ?? ["Intro", "Opening", "Body", "Closing"];
  const sections = o.sections ?? [1, 2, 3];
  const per = Math.ceil((o.bodyTurns ?? 30) / sections.length);
  let e = 1, y = 1;
  const E = (t: string) => `[Mina] E${e++} · ${t}`;
  const Y = (t: string) => `[Alex] Y${y++} · ${t}`;
  const lines = ["Kimchi before chili — a 15-minute look at kimjang", "", `## [${z[0]}]`, Y("Welcome to ear. Today we're looking at kimjang, the big kimchi-making day."), E("Hi, I'm Mina. I helped with it every November.")];
  lines.push("", `## [${z[1]}]`, Y("So what is kimjang, exactly?"), E("It's the day a household makes its winter kimchi, all at once."));
  lines.push("", `## [${z[2]}]`);
  let k = 0;
  for (const n of sections) {
    lines.push(`### #${n} Part ${n}`);
    for (let i = 0; i < per; i++, k++) {
      const host = k % 5 < 3 ? `${HOST[k % HOST.length]} the ${NOUNS[(k + 3) % NOUNS.length].toLowerCase()} come first in that order?` : `${REACT[k % REACT.length]} that taking most of a weekend.`;
      lines.push(Y(host), E(LONG_E(NOUNS[k % NOUNS.length])));
    }
  }
  lines.push("", `## [${z[3]}]`, E("Kimjang turns a hard seasonal job into a shared one. The work is split. The food is shared. That is why it lasted."));
  lines.push(o.lastTurn ?? Y(`${SIGNOFF}. Thanks for listening, and see you next time.`));
  return lines.join("\n");
}

test("형식 계약·문체를 지킨 영어 대본은 위반이 없고, 한국어 문체·귀속 검사는 돌지 않는다", () => {
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

// ── 문체 L0 (2026-10-15 — guidelines full-en 규칙 9·13·14·21~33·36·45·46) ──
const { enStyleViolations, EN_STYLE_MARK, isRatioViolation } = await import("./draft-two-stage.js");
const T = (id: string, text: string, section = "Body") => ({ speaker: id.startsWith("E") ? "Mina" : "Alex", id, text, section });

test("계약 위반 — 대본 ID·제작 용어·군말과 지문·상대 시점·긴 해설 턴·턴당 수치 과다는 문체 표지 없이(한도 뒤 실패)", () => {
  en();
  const v = enStyleViolations([
    T("Y1", "Welcome. Today we're talking about kimjang.", "Intro"),
    T("E1", "Families share the work C03. In the next section we look at salt."),
    T("Y2", "Um, that sounds hard [laughs]."),
    T("E2", "Kimjang is still common these days."),
    T("E3", "One. Two. Three. Four. Five. Six. Seven."),
    T("E4", "In 2013, 2014, 2015, 2016, and 2017 the numbers rose."),
    T("Y3", "That's all for today on ear podcast.", "Closing"),
  ]);
  const hard = v.filter((x) => !x.startsWith(EN_STYLE_MARK));
  assert.match(hard.join("\n"), /Claim or excerpt IDs in spoken lines \(E1 "C03"\)/);
  assert.match(hard.join("\n"), /Production words in spoken lines \(E1 "next section"\)/);
  assert.match(hard.join("\n"), /Fillers, sound tags, or stage directions \(Y2 "Um"\)/);
  assert.match(hard.join("\n"), /Relative time words outside the templates \(E2 "these days"\)/); // Y1·마지막 턴의 "Today" 는 템플릿이라 뺀다
  assert.match(hard.join("\n"), /Explainer turns over six sentences \(E3 \(7\)\)/);
  assert.match(hard.join("\n"), /five or more numbers \(E4 \(5\)\)/);
});

test("문체 위반 — 문장부호·AI 어휘·관광 안내문·과장 동사·상투 반응·예고·자문자답·교훈·대조 과다는 문체 표지(한도 뒤 QA 로)", () => {
  en();
  const v = enStyleViolations([
    T("E1", "Kimchi is crucial — it serves as a testament to a vibrant culture, highlighting change."),
    T("Y1", "Exactly! Great question, by the way."),
    T("E2", "Let's dive in. Why? Because the jars were shared. It reminds us of something."),
    T("E3", "It's not food, it's labor. Not just salt but time. Work rather than rest."),
  ]);
  const soft = v.filter((x) => x.startsWith(EN_STYLE_MARK));
  for (const re of [/dashes, semicolons/, /AI vocabulary \(E1 "crucial"\)/, /brochure language \(E1 "vibrant"\)/, /inflated verbs or a comment tail \(E1 "serves as"\)/, /stock reactions or praise \(Y1 "Exactly"\)/, /signposting .* \(E2 "Let's dive"\)/, /self-answered questions in explainer turns \(E2 "Why\? B"\)/, /morals or slogans \(E2 "It reminds us"\)/, /contrast frames .* used 3 times/]) assert.match(soft.join("\n"), re);
  assert.ok(soft.every(isRatioViolation)); // 한도 뒤 남아도 QA 로 넘긴다
  assert.deepEqual(l0Next(soft, L0_FIX_MAX), { action: "pass", residual: soft });
});

test("첫마디 반복·So 첫마디·본문 진행 턴 질문 비율", () => {
  en();
  const body = Array.from({ length: 8 }, (_, i) => T(`Y${i + 2}`, i < 7 ? `So why does it matter ${i}?` : "Fair enough."));
  const v = enStyleViolations([T("Y1", "Welcome.", "Intro"), ...body, T("Y10", "Bye.", "Closing")]).join("\n");
  assert.match(v, /the same turn opener more than three times: "so why" ×7/);
  assert.match(v, /7 turns open with "So" or "Okay, so"/);
  assert.match(v, /7 of 8 Body host turns are questions \(88%\)/);
});

test("평범한 영어 문장은 걸리지 않는다 — 흔한 단어·시각 콜론·하이픈 단어·숫자 셋", () => {
  en();
  assert.deepEqual(enStyleViolations([
    T("E1", "The market opens at 9:30, and the well-known stalls sell out by noon. Prices rose about 3 percent in 2019 and 2020."),
    T("Y1", "I'd guess the early buyers are older people who live nearby."),
    T("E2", "Some are, and many are students who grew up in the area. They come back for the same soup."),
  ]), []);
});

// ── full-en-v0.2 (2026-10-16 — G261015-001 에이전트 판정에서 L0 를 빠져나간 것) ──
test("진행 턴 첫 단어 반복 — 첫 두 단어가 달라도 같은 첫 단어가 다섯 번이면 걸리고, 의문사로 여는 질문은 세지 않는다", () => {
  en();
  const host = ["I'd feel ready.", "I'd still prefer one.", "I'd guess older people.", "I'd want the sound.", "I'd say it's casual."].map((x, i) => T(`Y${i + 2}`, x));
  const qs = ["What does it mean?", "What changes then?", "What about tone?", "What if it's rude?", "What comes next?"].map((x, i) => T(`Y${i + 7}`, x));
  const v = enStyleViolations([T("Y1", "Welcome.", "Intro"), ...host, ...qs, T("Y20", "Bye.", "Closing")]).join("\n");
  assert.match(v, /the same first word opens more than four host turns: "i'd" ×5/);
  assert.doesNotMatch(v, /"what" ×/);
});

test("해설이 진행자의 말을 되받아 여는 턴이 넷 이상이면 문체 위반, 셋까지는 통과", () => {
  en();
  const e = (n: number) => [T("Y1", "Welcome.", "Intro"), ...Array.from({ length: n }, (_, i) => T(`E${i + 1}`, i % 2 ? "Your hesitation concerns the setting. The word is casual." : "The statement is the use you've chosen. Tone tells them apart.")), T("Y9", "Bye.", "Closing")]; // 첫·마지막 턴은 템플릿이라 뺀다
  assert.match(enStyleViolations(e(4)).join("\n"), /4 explainer turns open by restating the host's words/);
  assert.doesNotMatch(enStyleViolations(e(3)).join("\n"), /restating the host's words/);
  assert.doesNotMatch(enStyleViolations([T("Y1", "Welcome.", "Intro"), ...[1, 2, 3, 4].map((n) => T(`E${n}`, "It is casual. Your question about tone comes up later.")), T("Y9", "Bye.", "Closing")]).join("\n"), /restating/); // 첫 문장만 본다
});

test("한 단락에서 소스가 문장 주어인 해설 문장이 셋 이상이면 문체 위반 — 소개 한 문장과 하나는 통과", () => {
  en();
  const B = (id: string, text: string, topic: string) => ({ ...T(id, text), topic });
  const v = enStyleViolations([
    B("E1", "A Korea.net report covers a new book. The compiler says it includes usage.", "Oppa"),
    B("E2", "The compiler describes a need for materials. The report also lists a boyfriend.", "Oppa"),
    B("E3", "The guide treats listening separately. Dramas help with listening.", "Reactions"),
    B("E4", "The guide warns about strangers.", "Reactions"),
  ]).join("\n");
  assert.match(v, /the source is the subject of more than two sentences in a section: "Oppa" 3 \(E1, E2\)/);
  assert.doesNotMatch(v, /"Reactions"/);
});

test("claims 작업 용어 attributed 는 제작 용어 계약 위반", () => {
  en();
  assert.match(enStyleViolations([T("E1", "A conversation gives us an attributed learner account.")]).join("\n"), /Production words in spoken lines \(E1 "attributed"\)/);
});
