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
const REACT = ["I can picture", "That might tire", "I'd guess", "My hunch is", "I'm surprised by", "It sounds"]; // full-en-v0.13: 질문 아닌 진행 턴의 would·I'd 는 셋까지
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

test("분량은 단어로 센다 — 5분 하한(730단어) 미달·구성안 예상의 1.6배 초과를 막는다", () => {
  en();
  const short = script({ bodyTurns: 6 });
  assert.match(twoStageViolations(short, OUTLINE).join(), new RegExp(`Length ${scriptStats(short).words} words .* below the 5-minute floor \\(730 words\\)`));
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
    T("Y3", "That's all for today on Earcast.", "Closing"),
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

test("소스가 문장 주어인 해설 문장은 하나라도 문체 위반 — 출처는 앱이 보여 준다 (full-en-v0.12)", () => {
  en();
  const B = (id: string, text: string, topic: string) => ({ ...T(id, text), topic });
  const v = enStyleViolations([
    B("E1", "A Korea.net report covers a new book. The compiler says it includes usage.", "Oppa"),
    B("E2", "The compiler describes a need for materials. The report also lists a boyfriend.", "Oppa"),
    B("E3", "The guide treats listening separately. Dramas help with listening.", "Reactions"),
    B("E4", "People are careful with strangers.", "Reactions"),
  ]).join("\n");
  assert.match(v, /sources named in lines: "Oppa" 3 \(E1, E2\)/);
  assert.match(v, /"Reactions" 1 \(E3\)/);
  assert.doesNotMatch(enStyleViolations([B("E1", "People say oppa to an older man.", "Oppa"), B("E2", "Some monks see the bell as a call.", "Bell")]).join("\n"), /sources named in lines/);
});

test("claims 작업 용어 attributed 는 제작 용어 계약 위반", () => {
  en();
  assert.match(enStyleViolations([T("E1", "A conversation gives us an attributed learner account.")]).join("\n"), /Production words in spoken lines \(E1 "attributed"\)/);
});

// 2026-10-17 출연진 4명 — 파서는 네 이름을 다 받으므로 이 편의 2인조와 다른 이름이 섞이면 L0 가 계약 위반으로 잡는다
test("화자 라벨이 이 편의 2인조와 다르면 계약 위반", async () => {
  en();
  delete process.env.PIPELINE_SPEAKERS;
  const { withSpeakers } = await import("@ear/pipeline");
  const { twoStageViolationsEn } = await import("./draft-two-stage.js");
  const md = ["## [Intro]", "[Owen] Y1 · Hi.", "## [Opening]", "[Yuna] E1 · A.", "[Grace] Y2 · B?", "## [Body]", "### #1 x", "[E-um] E2 · C."].join("\n");
  const v = withSpeakers(["Yuna", "Owen"], () => twoStageViolationsEn(md, "")).join("\n");
  assert.match(v, /Speaker labels do not match this episode's pair \(Y2 \[Grace\], E2 \[E-um\]\) — E turns are \[Yuna\], Y turns are \[Owen\]/);
});

// full-en-v0.6 (2026-10-17, G261017-001 에이전트 판정)
test("출처 이름 붙이기 — According to·In X's account·대문자 약어 주어도 센다, 한국어 표현 주어는 세지 않는다", () => {
  en();
  const S = (id: string, text: string, topic: string) => ({ speaker: "Yuna", id, text, section: "Body", topic });
  const v = enStyleViolations([
    S("E1", "In the KEL article, han is a personal regret. In KEL's description, it is also national.", "Han"),
    S("E2", "KEL presents that view as disputed. According to KEL, it came later.", "Han"),
    S("E3", "Jeongi deulda describes attachment taking hold. Hani maechida describes a grievance.", "Jeong"),
    S("E4", "In this guide's description, jeong grows slowly.", "Jeong"),
  ]).join("\n");
  assert.match(v, /sources named in lines: "Han" 4 \(E1, E2\)/);
  assert.match(v, /"Jeong" 1 \(E4\)/); // E3 의 한국어 표현 주어는 세지 않는다
});

test("해설자 질문은 Opening 에서 한 번만 — 본문 질문이나 Opening 두 번이면 문체 위반 (full-en-v0.14)", () => {
  en();
  const one = [T("Y1", "Hi.", "Intro"), T("E1", "Is it the meaning or the feeling?", "Opening"), T("E2", "It is the feeling."), T("Y2", "Slower."), T("Y3", "Bye.", "Closing")];
  assert.doesNotMatch(enStyleViolations(one).join("\n"), /explainer asks questions/);
  const body = [...one.slice(0, 2), T("E2", "Which would you pick?"), ...one.slice(3)];
  assert.match(enStyleViolations(body).join("\n"), new RegExp(`^${EN_STYLE_MARK} the explainer asks questions in 2 turns \\(E1, E2\\)`, "m"));
  const twoOpen = [one[0], one[1], T("E2", "Or is it the sound?", "Opening"), ...one.slice(3)];
  assert.match(enStyleViolations(twoOpen).join("\n"), /the explainer asks questions in 2 turns/);
});

test("한국어 표현을 가리키면서 등재 표제어를 말하지 않는 해설 턴은 문체 위반 — English expression·표제어가 있는 턴은 통과", async () => {
  en();
  delete process.env.PIPELINE_SPEAKERS;
  const { withSpeakers } = await import("@ear/pipeline");
  const { twoStageViolationsEn } = await import("./draft-two-stage.js");
  const md = ["## [Intro]", "[Owen] Y1 · Hi.", "## [Opening]", "[Yuna] E1 · A.", "## [Body]", "### #1 x",
    "[Yuna] E2 · Korean expressions distinguish a grievance that stays from one that is resolved.",
    "[Owen] Y2 · How?",
    "[Yuna] E3 · Hani maechida means a grievance settles deep. That expression is personal.",
    "[Owen] Y3 · And English?",
    "[Yuna] E4 · The English expression read the room covers part of it.",
    "[Owen] Y4 · And the regret?",
    "[Yuna] E5 · The sentence stays an expression of regret."].join("\n");
  const v = withSpeakers(["Yuna", "Owen"], () => twoStageViolationsEn(md, "", { pronunciations: { "hani maechida": "한이 맺히다" } })).join("\n");
  assert.match(v, /explainer turns speak of a Korean expression without saying it \(E2\)/);
  assert.equal(withSpeakers(["Yuna", "Owen"], () => twoStageViolationsEn(md, "")).join("\n").includes("without saying it"), false);
});

// full-en-v0.7 (2026-10-17, G261015-001 · G261017-001~003 에이전트 판정)
test("턴 끝 요약 — 세 문장 이상 해설 턴이 So·This·That·Both 등으로 묶으며 끝나는 곳이 넷 이상이면 문체 위반, 셋까지·질문·짧은 턴은 통과", () => {
  en();
  const tail = (id: string) => T(id, "A fact. Another fact. This changes the viewpoint.");
  const three = [T("Y1", "Hi.", "Intro"), tail("E1"), tail("E2"), tail("E3"), T("E4", "One. Two. So what do you think?"), T("E5", "So short."), T("Y2", "Bye.", "Closing")];
  assert.doesNotMatch(enStyleViolations(three).join("\n"), /sums up the turn/);
  const four = [...three.slice(0, 4), tail("E6"), ...three.slice(4)];
  assert.match(enStyleViolations(four).join("\n"), /4 explainer turns end on a sentence that sums up the turn \(E1, E2, E3, E6\)/);
});

test("출처 이름 계수 — 일반 명사·대문자 이름·대명사로 부르는 꼴도 센다(In the essay's explanation · A Korea JoongAng Daily report · It/She/Its)", () => {
  en();
  const S = (id: string, text: string) => ({ speaker: "Yuna", id, text, section: "Body", topic: "Kimjang" });
  const v = enStyleViolations([
    S("E1", "A Korea JoongAng Daily report describes regional kimchi. In the essay's explanation, drying lost flavor."),
    S("E2", "It dates the refrigerator to 1992. She connects soft leaves with warm weather. Its warning covers rest."),
  ]).join("\n");
  assert.match(v, /sources named in lines: "Kimjang" 5 \(E1, E2\)/);
});

// ── full-en-v0.9 (2026-10-17 — G261017-004~006 에이전트 판정: 한 문장 Imagine 장면 · 구성안 문구 유출) ──
test("Imagine 으로 시작하는 해설 문장이 셋 이상이면 문체 위반, 둘까지는 통과(템플릿 턴은 뺀다)", () => {
  en();
  const im = (n: number) => [T("Y1", "Imagine this, welcome.", "Intro"), ...Array.from({ length: n }, (_, i) => T(`E${i + 1}`, `Imagine a stall at dawn ${i}. The owner says hello.`)), T("Y9", "Bye.", "Closing")];
  assert.match(enStyleViolations(im(3)).join("\n"), /3 imagined scenes \("Imagine", "Picture", "imagined"\) \(E1, E2, E3\)/);
  assert.doesNotMatch(enStyleViolations(im(2)).join("\n"), /imagined scenes/);
});

test("읽기·설계 흔적 문구(described here · reported connection · possible starting picture)는 문체 위반", () => {
  en();
  const v = enStyleViolations([T("E1", "A possible starting picture is a bathhouse."), T("E2", "The rest area described here has mats. That reported connection is loose.")]).join("\n");
  assert.match(v, /planning or reading wording in lines \(E1 "possible starting picture", E2 "described here"\)/);
  assert.ok(v.split("\n").every(isRatioViolation));
});

test("구성안 지시 줄과 8단어 이상 겹치는 턴은 문체 위반 — 축·클로징·Host question 줄은 대조하지 않는다", async () => {
  en();
  const { outlineCopyViolations } = await import("./draft-two-stage.js");
  const outline = ["Axis: [contrast] the sauna is a place to sleep as well as to wash", "Familiar picture: a towel folded into a lamb shape on a heated floor", "Section #1 — Rest", "  Scene: some establishments allow overnight rest on heated floors near the baths", "  Host question: how does the rest part fit around the bath itself", "Closing line: the sauna is a place to sleep as well as to wash"].join("\n");
  const md = (e2: string) => ["## [Intro]", "[Alex] Y1 · Welcome.", "## [Body]", "### #1 Rest", "[Alex] Y2 · How does the rest part fit around the bath itself?", `[Mina] E2 · ${e2}`, "## [Closing]", "[Alex] Y3 · So the sauna is a place to sleep as well as to wash. Bye."].join("\n");
  const bad = outlineCopyViolations(md("Some establishments allow overnight rest on heated floors, so people stay."), outline);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /^Style limit: turns copy the outline's instruction wording \(E2 "some establishments allow overnight rest on heated floors"\)/);
  assert.doesNotMatch(bad[0], /Y2|Y3/);
  assert.ok(isRatioViolation(bad[0]));
  assert.deepEqual(outlineCopyViolations(md("Many places let you sleep on the warm floor until morning."), outline), []);
  assert.deepEqual(outlineCopyViolations(md("x"), ""), []);
});

// ── full-en-v0.10 (2026-10-17 — G261017-009~011 눈가림 판정: Picture 틀 · 자료 가리키기 · Terms 유출) ──
test("Picture 로 여는 문장과 imagined 를 쓴 문장도 상상 장면으로 세고, 진행자의 picture 는 세지 않는다", () => {
  en();
  const v = enStyleViolations([T("Y1", "Welcome.", "Intro"), T("E1", "Picture an imagined viewer at home. The screen is on."), T("Y2", "I can't picture it."), T("E2", "Imagine a stall at dawn."), T("E3", "In an imagined comparison, a viewer sees two lengths."), T("Y9", "Bye.", "Closing")]).join("\n");
  assert.match(v, /3 imagined scenes .* \(E1, E2, E3\)/);
  assert.doesNotMatch(enStyleViolations([T("Y1", "Welcome.", "Intro"), T("E1", "Picture a stall at dawn."), T("Y2", "I can't picture it."), T("E2", "The owner says hello."), T("Y9", "Bye.", "Closing")]).join("\n"), /imagined scenes/);
});

test("자료를 가리키는 말과 보이지 않는 그림(named in the report · in the reporting · mentioned earlier · this picture of)은 문체 위반", () => {
  en();
  const v = enStyleViolations([T("E1", "They were at Gyeongbokgung, the palace named in the report."), T("E2", "A producer quoted in the reporting said so."), T("E3", "The institute was behind the survey mentioned earlier."), T("E4", "The museum provides this picture of a table.")]).join("\n");
  assert.match(v, /planning or reading wording in lines \(E1 "named in the report", E2 "in the reporting", E3 "survey mentioned earlier", E4 "this picture of"\)/);
  assert.doesNotMatch(enStyleViolations([T("E1", "Families set the table on the morning of Chuseok.")]).join("\n"), /planning or reading wording/);
});

test("구성안 Terms 줄과 8단어 이상 겹치는 턴도 문체 위반", async () => {
  en();
  const { outlineCopyViolations } = await import("./draft-two-stage.js");
  const outline = "Terms: traditional hanbok — the traditional clothing forms being discussed in this episode";
  const md = ["## [Intro]", "[Alex] Y1 · Welcome.", "## [Body]", "### #1 Forms", "[Mina] E2 · That is traditional hanbok, the traditional clothing forms being discussed in this episode.", "## [Closing]", "[Alex] Y3 · Bye."].join("\n");
  assert.match(outlineCopyViolations(md, outline)[0] ?? "", /turns copy the outline's instruction wording \(E2/);
});

// ── tpl-en-v4 (2026-10-18): 클로징 도입 칸은 인트로 칸과 다른 말로 ──
test("클로징 도입의 {episode_recap} 이 인트로의 {episode_line} 과 같은 단어면 계약 위반, 다른 말이면 통과", async () => {
  en();
  const { twoStageViolationsEn } = await import("./draft-two-stage.js");
  const md = (recap: string) => ["## [Intro]", "[Alex] Y1 · Hi. Today we're talking about how a temple day runs.", "## [Opening]", "[Alex] Y2 · Okay.", "## [Body]", "### #1 Day", "[Mina] E1 · The day starts early.", "## [Closing]", `[Alex] Y3 · We've been talking about ${recap}. How does it fit together?`, "[Mina] E2 · It fits.", "[Alex] Y4 · Bye."].join("\n");
  assert.ok(twoStageViolationsEn(md("how a temple day runs"), "").some((x) => /repeats the intro's line/.test(x)));
  assert.ok(!twoStageViolationsEn(md("the rhythm of a day at a temple"), "").some((x) => /repeats the intro's line/.test(x)));
});


// ── full-en-v0.13 (2026-10-18 — G261018-006~008 에이전트 판정) ──
test("출처를 종류·연도로 가리키는 해설 문장도 출처 문장으로 센다 — 통계의 자료 연도는 세지 않는다", () => {
  en();
  const B = (id: string, text: string, topic: string) => ({ ...T(id, text), topic });
  const v = enStyleViolations([
    B("E1", "A drama commentator reads these meals as quiet confessions. For a food writer, the side dishes matter most.", "Meals"),
    B("E2", "In that 2017 description, thread means a long life. A sociologist speaking in 2026 linked it to survival.", "Doljabi"),
    B("E3", "In 2026, guest lists had become smaller.", "Party"),
    B("E4", "About 18 percent of people ate alone in 2022. In 2022, the city counted more single homes.", "Alone"),
  ]).join("\n");
  assert.match(v, /sources named in lines: "Meals" 2 \(E1\); "Doljabi" 2 \(E2\); "Party" 1 \(E3\)/);
  assert.doesNotMatch(v, /"Alone"/);
});

test("Opening 을 Imagine·Picture 로 열면 한 번이라도 문체 위반 — 본문의 장면은 해당 없음", () => {
  en();
  const v = enStyleViolations([T("Y1", "Welcome.", "Intro"), T("E1", "Imagine a small café full of posters.", "Opening"), T("E2", "Picture a fan at the door."), T("Y2", "Bye.", "Closing")]).join("\n");
  assert.match(v, /the Opening starts with "Imagine" or "Picture" \(E1\)/);
});

test("질문 아닌 진행 턴의 자기 상태 서술(would·I'd·to me·I find)은 셋까지 통과, 넷이면 문체 위반 — 질문은 세지 않는다", () => {
  en();
  const host = (n: number) => [T("Y1", "Welcome.", "Intro"), ...Array.from({ length: n }, (_, i) => T(`Y${i + 2}`, ["I'd feel shy at that table.", "That would make me slow down.", "That part is easier for me.", "I notice the quiet."][i % 4])), T("Y8", "Would you eat alone?"), T("Y9", "Bye.", "Closing")];
  assert.doesNotMatch(enStyleViolations(host(3)).join("\n"), /host's own state/);
  assert.match(enStyleViolations(host(4)).join("\n"), /4 host turns that are not questions speak about the host's own state .* \(Y2, Y3, Y4, Y5\)/);
});

test("구성안 장면 메모 말투(gives one example·broader … event)는 설계 흔적으로 잡는다", () => {
  en();
  assert.match(enStyleViolations([T("E1", "A broader K-pop café event gives one example.")]).join("\n"), /planning or reading wording in lines \(E1 "broader K-pop café event"\)/);
});

// ── full-en-v0.14 (2026-10-18 — G261018-010~012 에이전트 판정) ──
test("해설 턴의 규범형(should·are instructed to·must)은 둘까지 통과, 셋이면 문체 위반", () => {
  en();
  const wrap = (body: ReturnType<typeof T>[]) => [T("Y1", "Welcome.", "Intro"), ...body, T("Y9", "Bye.", "Closing")]; // 첫·마지막 턴은 템플릿이라 뺀다
  const two = [T("E1", "Diners should wait. Students are instructed to arrive early."), T("E2", "The grill heats fast.")];
  assert.doesNotMatch(enStyleViolations(wrap(two)).join("\n"), /tell the listener what to do/);
  const three = [...two, T("E3", "Guests must take off their shoes.")];
  assert.match(enStyleViolations(wrap(three)).join("\n"), /tell the listener what to do \("should", "are instructed to", "must"\) 3 times \(E1, E3\)/);
});

test("구성안 칸 이름(familiar picture·insider detail)이 대사에 나오면 설계 흔적", () => {
  en();
  assert.match(enStyleViolations([T("E1", "The familiar picture is a quiet morning.")]).join("\n"), /planning or reading wording in lines \(E1 "familiar picture"\)/);
});
