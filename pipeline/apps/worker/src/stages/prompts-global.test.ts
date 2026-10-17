import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_URL ??= "postgres://test";
const P = await import("@ear/pipeline");
const { writeDesignArtifactsEn, normalizeOutlineEn, parsePriorExcerpts, deriveAttribution } = await import("./design-single.js");
const { addPronunciations } = await import("../tts/normalize.js");
const { twoStageViolations } = await import("./draft-two-stage.js");

// 2026-10-15 KAN-201 — 글로벌판 대본 프롬프트(설계·대본·수정·축 심사)는 영어이고, 워커가 대조하는 표기(구성안·구역·줄 문법·발음 맵)를 그대로 지시한다
const saved = { locale: process.env.PIPELINE_LOCALE, speakers: process.env.PIPELINE_SPEAKERS };
afterEach(() => {
  if (saved.locale === undefined) delete process.env.PIPELINE_LOCALE; else process.env.PIPELINE_LOCALE = saved.locale;
  if (saved.speakers === undefined) delete process.env.PIPELINE_SPEAKERS; else process.env.PIPELINE_SPEAKERS = saved.speakers;
});
const en = () => { process.env.PIPELINE_LOCALE = "en"; process.env.PIPELINE_SPEAKERS = "Mina,Alex"; };
const HANGUL = /[가-힣]/;

const cand = { id: "C1", title: "Why kimjang is shared work", mid_topic: "K-Food", angle: null, summary: null, sources: [{ url: "https://korea.net/a", publisher: "korea.net", title: "Kimjang", published: "2026-01-02", roles: ["anchor"] }], axis: "Kimjang looks like cooking, yet it is a labor exchange", axis_type: "contrast", gaps: [] } as unknown as Parameters<typeof P.buildDesignPromptInlinePartsEn>[0]["candidate"];
const guidelines = "# Script Writing Guidelines\n\n1. **The explainer is a Korean insider.**";
const tpl = { version: "tpl-en-v0", intro: "Welcome to ear. {topic_line} Today: {episode_line}", closing: "That brings us to the end. What's the one thing to keep?", closing_signoff: "That's all for today on ear. {host_line}", major_lines: { "K-Food": "Food, and the life around it." } };

test("설계 프롬프트 — 영어 지시문, 구성안 형식(Section #n·Question·Estimated length), 발음 맵은 한국어 단어 전부(힌트 없으면 빈 값)", () => {
  en();
  const p = P.buildDesignPromptInlinePartsEn({ episodeId: "G261015-001", candidate: cand, promptVersion: "en-v0.1", guidelines, specScript: "", goldFullEum: "", goldFullYuna: "", sources: [{ n: 1, url: "https://korea.net/a", publisher: "korea.net", title: "Kimjang", ok: true, blocks: [{ id: "S1-01", text: "김장은 겨울 김치를 한 번에 담그는 일이다." }] }] });
  assert.doesNotMatch(p.system, HANGUL);
  assert.match(p.system, /Section #1 — Title\n {2}Purpose:[\s\S]*Question:/);
  assert.match(p.system, /Estimated length: n min/);
  assert.match(p.system, /Leave reading empty when you cannot give one/);
  assert.match(p.user, /Explainer: \*\*Mina\*\* \/ host: \*\*Alex\*\*/);
  assert.match(p.user, /# Outline — G261015-001/);
  // 소스 본문(한글)은 사용자 메시지에만 — 지시문은 영어로 둔다
  assert.match(p.user, /\[S1-01\] 김장은/);
});

test("설계가 내는 구성안 표기는 en L0 가 읽는 표기와 같다 — 정규화 후 구간 계약·예상 분량을 잰다", () => {
  en();
  const outline = normalizeOutlineEn(["# Outline — G1", "**Axis:** [contrast] x", "- Estimated length: 8 min", "### Section 1: Start", "  Question: q1", "Section #2 — Next", "  Question: q2"].join("\n"));
  assert.match(outline, /^Axis: \[contrast\] x$/m);
  assert.match(outline, /^Estimated length: 8 min$/m);
  assert.match(outline, /^Section #1 — Start$/m);
  const script = ["## [Intro]", "## [Opening]", "## [Body]", "### #1 Start", "## [Closing]"].join("\n");
  assert.match(twoStageViolations(script, outline).join(), /outline has 2 sections but the script has 1/);
});

test("대본 프롬프트 — 구역·줄 문법·화자 이름·단어 목표, 템플릿 슬롯, 영어 도입 방식", () => {
  en();
  const style = P.pickIntroStyle(1);
  assert.equal(style.label, "one object");
  const p = P.buildWritePromptPartsEn({ episodeId: "G261015-001", candidate: cand, introStyle: style, promptVersion: "en-v0.1", templates: tpl, majorTopic: "K-Food", signoffSeed: 0, estimatedMinutes: 14, guidelines, specScript: "", goldFullEum: "", goldFullYuna: "", sourcesMd: "s", claimsMd: "c", outlineMd: "o", pronunciationsJson: "{}" });
  assert.doesNotMatch(p.system, HANGUL);
  assert.doesNotMatch(p.user, HANGUL);
  assert.match(p.system, /`## \[Intro\]` `## \[Opening\]` `## \[Body\]` `## \[Closing\]`/);
  assert.match(p.system, /`\[Mina\] E1 · sentence` and `\[Alex\] Y1 · sentence`/);
  assert.match(p.user, /about 14 minutes = about 2100 spoken words/);
  assert.match(p.user, /\{topic_line\} = "Food, and the life around it\." \(fixed text/);
  assert.match(p.user, /That's all for today on ear\. \{host_line\}/);
});

test("역사 모드는 History & Society 의 사건형 축 후보만", () => {
  assert.equal(P.isHistoryCandidateEn({ mid_topic: "Korean History & Society", axis_type: "event" }), true);
  assert.equal(P.isHistoryCandidateEn({ mid_topic: "Korean History & Society", axis_type: "contrast" }), false);
  assert.equal(P.isHistoryCandidateEn({ mid_topic: "K-Food", axis_type: "event" }), false);
});

test("수정·축 심사 프롬프트도 영어이고, 스키마 설명에 한글이 없다", () => {
  en();
  const r = P.buildRevisionPromptInlinePartsEn({ episodeId: "G1", attempt: 2, qaFailures: [{ location: "whole script", item: "L0 format contract", reason: "Length 1400 words" }], guidelines, scriptMd: "x", claimsMd: "c", sourcesMd: "s", outlineMd: "o", pronunciationsJson: "{}" });
  assert.doesNotMatch(r.system + r.user, HANGUL);
  assert.match(r.user, /1\. \[whole script\] L0 format contract: Length 1400 words/);
  const a = P.buildAxisCheckPromptPartsEn({ outlineMd: "Axis: x", history: true });
  assert.doesNotMatch(a.system + a.user, HANGUL);
  assert.match(a.system, /History mode/);
  for (const s of [P.DESIGN_INLINE_SCHEMA_EN, P.WRITE_SCHEMA_EN, P.REVISION_INLINE_SCHEMA_EN, P.AXIS_CHECK_SCHEMA_EN]) assert.doesNotMatch(JSON.stringify(s), HANGUL);
});

test("한국판 도입 방식 선택은 종전과 같다", () => {
  delete process.env.PIPELINE_LOCALE;
  for (let seed = 0; seed < 9; seed++) assert.equal(P.pickIntroStyle(seed), P.INTRO_STYLES[seed % P.INTRO_STYLES.length]);
});

test("설계 산출물(en) — 영어 머리·발췌 언어 열·빈 힌트 등재, 이전 편 발췌 파서가 그대로 읽는다", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-en-"));
  const fetched = [{ n: 1, url: "https://korea.net/a", ok: true, status: 200, title: "Kimjang", byline: null, chars: 40, blocks: [{ id: "S1-01", text: "김장은 겨울 김치를 한 번에 담그는 일이다." }, { id: "S1-02", text: "Families trade labor during kimjang." }] }];
  const o = { gists: [{ s: 1, lines: ["a", "b", "c"] }], outline_md: "# Outline — G1\n", pronunciations: [{ term: "kimjang", reading: "keem-jahng" }, { term: "pumasi", reading: "" }],
    claims: [{ id: "C01", text: "Kimjang is making winter kimchi at once.", excerpt_ids: ["S1-01"], type: "definition", section: 1, notable: false, opinion: false }, { id: "C02", text: "Families trade labor.", excerpt_ids: ["S1-02"], type: "number", section: 1, notable: false, opinion: false }] };
  await writeDesignArtifactsEn({ dir, episodeId: "G1", cand: { ...cand, sources: [{ ...cand.sources[0] }] } as never, fetched: fetched as never, o: o as never, chosen: new Set(["S1-01", "S1-02"]), priorNotes: [], attribution: deriveAttribution(o.claims), sectionsOf: new Map([[1, new Set([1])]]), axis: null });
  const claims = await fs.readFile(path.join(dir, "claims.md"), "utf8");
  assert.match(claims, /\| C01 \| Kimjang is making winter kimchi at once\. \| S1-01 \| definition \| #1 \|  \|  \| none \| ko \|/);
  assert.match(claims, /\| C02 \| .* \| number \| #1 \|  \|  \| attributed \| en \|/);
  assert.doesNotMatch(claims.replace(/\| [^|]*[가-힣][^|]* \|/g, ""), HANGUL);
  const sources = await fs.readFile(path.join(dir, "sources.md"), "utf8");
  assert.match(sources, /^- Gist: a \/ b \/ c$/m);
  assert.deepEqual(parsePriorExcerpts(sources).get("https://korea.net/a"), ["김장은 겨울 김치를 한 번에 담그는 일이다.", "Families trade labor during kimjang."]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, "pronunciations.json"), "utf8")), { kimjang: "keem-jahng", pumasi: "" });
  await fs.rm(dir, { recursive: true, force: true });
});

test("발음 등재 추가 — 한국판 종전 그대로, 글로벌판은 빈 힌트도 남기고 대소문자 무시·빈 값만 채운다", () => {
  assert.deepEqual(addPronunciations({ AI: "에이아이" }, [{ term: "AI", reading: "다른" }, { term: "GPT", reading: "" }, { term: "LLM", reading: "엘엘엠" }], "ko"), { AI: "에이아이", LLM: "엘엘엠" });
  assert.deepEqual(addPronunciations({ Hanbok: "", jeong: "jung" }, [{ term: "hanbok", reading: "hahn-bok" }, { term: "Jeong", reading: "WRONG" }, { term: " nunchi ", reading: "" }], "en"), { Hanbok: "hahn-bok", jeong: "jung", nunchi: "" });
});

test("글로벌 규칙 자산 — 버전 라벨 full-en-v0.6, 모델에 가는 본문에 한글이 없고 규칙 50개, 템플릿 문서와 같은 슬롯", async () => {
  const { versionOf } = await import("../assets.js");
  const root = path.resolve(import.meta.dirname, "../../../../../docs/ai/global");
  const g = await fs.readFile(path.join(root, "skills/draft/guidelines.gpt.md"), "utf8");
  assert.equal(versionOf("skills/draft/guidelines.gpt.md", g), "full-en-v0.6");
  assert.equal(versionOf("skills/draft/guidelines.md", "# x\n\n> 현행 버전: **full-v9.10**"), "full-v9.10"); // 한국판 라벨 그대로
  const body = P.promptBody(g);
  assert.doesNotMatch(body, HANGUL);
  assert.equal(body.match(/^\s*\d+\. \*\*/gm)?.length, 50);
  const spec = await fs.readFile(path.join(root, "spec/04-script.md"), "utf8");
  assert.match(spec, /Hi, and annyeonghaseyo! Welcome to Earcast, your K-podcast\. \{topic_line\} Today we're talking about \{episode_line\}\.\n/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, "skills/tts/pronunciation.json"), "utf8")), { annyeonghaseyo: "안녕하세요", gamsahamnida: "감사합니다" }); // 인트로 인사(tpl-en-v2)·끝인사(v3) — 한글로 읽힌다
});

test("QA(en) — 영어 지시문·스키마, 자산 본문 한글 없음·버전 qa-en-v0.5, 이전 회차 실패는 check 번호로", async () => {
  const { versionOf } = await import("../assets.js");
  const root = path.resolve(import.meta.dirname, "../../../../../docs/ai/global");
  const qa = await fs.readFile(path.join(root, "skills/qa/prompt.md"), "utf8");
  assert.equal(versionOf("skills/qa/prompt.md", qa), "qa-en-v0.5");
  const body = P.promptBody(qa);
  assert.doesNotMatch(body, HANGUL);
  assert.doesNotMatch(body, /Change history/); // --- 아래 이력은 모델에 가지 않는다
  const spec = await fs.readFile(path.join(root, "spec/05-qa.md"), "utf8");
  const p = P.buildQaPromptInlinePartsEn({ episodeId: "G1", attempt: 2, qaPromptMd: body, specQaMd: spec, scriptMd: "s", claimsMd: "c", sourcesMd: "김장은 …", priorFailures: [{ location: "Y4 · So the rice", item: "8", reason: "assumes E6" }], fixes: [{ location: "Y4", before: "a", after: "b" }] });
  assert.doesNotMatch(p.system, HANGUL);
  assert.match(p.system, /"### Checks" \(a table with 11 rows/);
  assert.match(p.user, /1\. \[Y4 · So the rice\] check 8: assumes E6/);
  assert.doesNotMatch(JSON.stringify(P.QA_INLINE_SCHEMA_EN), HANGUL);
});

test("비평(en) — 루브릭 critic-en 본문 한글 없음, 하위 항목 12개·배점 합 100, 플래그 코드는 콘솔 형식(문자+숫자), 스키마 키는 한국판과 같다", async () => {
  en();
  const { versionOf } = await import("../assets.js");
  const root = path.resolve(import.meta.dirname, "../../../../../docs/ai/global");
  const rb = await fs.readFile(path.join(root, "skills/critic/rubric-v2.md"), "utf8");
  assert.equal(versionOf("skills/critic/rubric-v2.md", rb), "critic-en-v0.4");
  const body = P.promptBody(rb, { dropSections: [/^## 0\./] });
  assert.doesNotMatch(body, HANGUL);
  assert.doesNotMatch(body, /Change history/);
  const items = [...body.matchAll(/^\*\*3\.(\d+) [^(]+\((\d+)\)\*\*/gm)];
  assert.equal(items.length, 12);
  assert.equal(items.reduce((a, m) => a + Number(m[2]), 0), 100);
  for (const m of body.matchAll(/^\| ([A-Z]\d+) \|/gm)) assert.match(m[1], /^[A-G]\d/);
  const p = P.buildCriticPromptInlinePartsEn({ episodeId: "G1", title: "t", midTopic: "K-Food", rubricV2Md: body, guidelines: "g", scriptMd: "s" });
  assert.doesNotMatch(p.system + p.user, HANGUL);
  assert.deepEqual([...P.CRITIC_INLINE_SCHEMA_EN.required].sort(), [...P.CRITIC_INLINE_SCHEMA.required].sort());
  assert.doesNotMatch(JSON.stringify(P.CRITIC_INLINE_SCHEMA_EN), HANGUL);
});

test("주제 기획·보강(en) — 검색·판정 프롬프트와 스키마에 한글이 없고, 판정 결과는 내부 값(성립·근거 앵커·대립)으로 바뀐다", () => {
  en();
  const s1 = P.buildTopicSeedSearchPromptEn({ id: "C1", topic: "Why kimjang is shared work", hint: null, midTopic: "K-Food", poolHosts: ["korea.net"], maxSearches: 8 });
  const s2 = P.buildReinforceSearchPromptEn({ candidate: { id: "C1", title: "Kimjang", mid_topic: "K-Food", axis: "Kimjang looks like cooking, yet it is a labor exchange", axis_type: "대립", gaps: ["반론·한계"], sources: [{ publisher: "korea.net", title: "Kimjang" }] }, poolHosts: ["korea.net"], maxSearches: 8 });
  assert.match(s2, /Axis \(contrast\)/);
  assert.match(s2, /counterpoint — /);
  const seedJudge = P.buildTopicJudgePromptEn({ midTopics: ["K-Food"], nextIdNumber: 1, sources: [{ n: 1, url: "u", title: "Kimjang", summary: "s", publisher: "korea.net", domain: "korea.net", published: null }], existingTitles: [], specBacklogExcerpt: "## 3. Candidate structure", seed: { id: "C1", topic: "Kimjang", hint: null, midTopic: "K-Food" } });
  const reJudge = P.buildTopicJudgePromptEn({ midTopics: ["K-Food"], nextIdNumber: 1, sources: [], existingTitles: [], specBacklogExcerpt: "", reinforce: { id: "C1", title: "Kimjang", axis: "x", axis_type: "역설", gaps: ["사례"], currentM: [] }, reinforceMidTopic: "K-Food" });
  for (const t of [s1, s2, seedJudge, reJudge]) assert.doesNotMatch(t, HANGUL);
  assert.match(reJudge, /axis \(paradox\)/);
  assert.match(reJudge, /Empty roles: case/);
  assert.throws(() => P.buildTopicJudgePromptEn({ midTopics: ["K-Food"], nextIdNumber: 1, sources: [], existingTitles: [], specBacklogExcerpt: "" }), /seed/);
  for (const sc of [P.REINFORCE_SEARCH_SCHEMA_EN, P.CLUSTER_SCHEMA_V2_EN]) assert.doesNotMatch(JSON.stringify(sc), HANGUL);
  const out = P.judgeToInternal({ candidates: [{ axis_type: "contrast", verdict: "holds", gaps: ["counterpoint"], sources: [{ m: "M1", roles: ["anchor", "case"], why: "w" }], title: "T" }] });
  assert.deepEqual(out.candidates?.[0], { axis_type: "대립", verdict: "성립", gaps: ["반론·한계"], sources: [{ m: "M1", roles: ["근거 앵커", "사례"], why: "w" }], title: "T" });
  assert.equal(P.judgeToInternal({ candidates: [{ axis_type: "event", verdict: "needs reinforcement", gaps: [], sources: [] }] }).candidates?.[0].verdict, "보강 필요");
});

test("설계 프롬프트(en)는 백로그의 내부 값(역할·축 유형)을 영어로 보여 준다", () => {
  en();
  const c = { ...cand, axis_type: "대립", gaps: ["반론·한계"], sources: [{ ...cand.sources[0], roles: ["근거 앵커"] }] } as typeof cand;
  const p = P.buildDesignPromptInlinePartsEn({ episodeId: "G1", candidate: c, promptVersion: "v", guidelines, specScript: "", goldFullEum: "", goldFullYuna: "", sources: [] });
  assert.doesNotMatch(p.user, HANGUL);
  assert.match(p.user, /\[contrast\] Kimjang looks like cooking/);
  assert.match(p.user, /korea\.net: anchor/);
  assert.match(p.user, /Empty roles: counterpoint/);
});

test("판정(en) — 도메인 등급 표시·앵커는 1군만, 보조 주제 후보, 사건형은 History & Society 만, 보강은 축 유지, 국문 개인 출판 제외", () => {
  en();
  const base = { midTopics: ["K-Food"], nextIdNumber: 1, existingTitles: [], specBacklogExcerpt: "" };
  const src = [{ n: 1, url: "u1", title: "t", summary: null, publisher: "Korea.net", domain: "korea.net", published: null, tier: "allow_open" }, { n: 2, url: "u2", title: "t", summary: null, publisher: "Soompi", domain: "soompi.com", published: null, tier: "candidate" }];
  const seed = P.buildTopicJudgePromptEn({ ...base, sources: src, seed: { id: "C1", topic: "Kimjang", hint: null, midTopic: "K-Food" }, subTopicOptions: ["Korean Culture", "Travel in Korea"] });
  assert.match(seed, /\[M1\] Korea\.net · date unknown · tier 1/);
  assert.match(seed, /\[M2\] Soompi · date unknown · domain not judged/);
  assert.match(seed, /Give the anchor role only to sources marked tier 1/);
  assert.match(seed, /sub_topic: one of "Korean Culture", "Travel in Korea" only when/);
  assert.match(seed, /Do not use axis_type "event"/);
  assert.match(seed, /Set the count to the items the sources support and put that count in the title\. List the counted items in landing\./);
  assert.doesNotMatch(seed, /7 instead of 10/); // 규칙에 예시 숫자를 두지 않는다 — 그대로 복제된다
  assert.match(seed, /A domain not yet judged is not a reason for "needs reinforcement"/);
  assert.doesNotMatch(seed, /History mode/);
  const hist = P.buildTopicJudgePromptEn({ ...base, midTopics: ["Korean History & Society"], sources: src, seed: { id: "C2", topic: "The 1988 Olympics", hint: null, midTopic: "Korean History & Society" } });
  assert.match(hist, /use axis_type "event" only for a past event in Korean History & Society/);
  assert.match(hist, /sub_topic: null/);
  const re = P.buildTopicJudgePromptEn({ ...base, sources: src, reinforce: { id: "C1", title: "Kimjang", axis: "x", axis_type: "대립", gaps: [], currentM: ["M1"] }, reinforceMidTopic: "K-Food" });
  assert.match(re, /do not set a new axis\. Apply rules 2 to 6 below/);
  const search = P.buildTopicSeedSearchPromptEn({ id: "C1", topic: "Kimjang", hint: null, midTopic: "K-Food", poolHosts: [], maxSearches: 8 });
  assert.match(search, /Naver or Daum blogs and cafes, Tistory, Brunch/);
  assert.match(search, /at least 1 case/);
  assert.match(search, /official English name/);
  assert.equal(P.judgeToInternal({ candidates: [{ axis_type: "contrast", verdict: "holds", gaps: [], sources: [], sub_topic: "Korean Culture" }] }).candidates?.[0].sub_topic, "Korean Culture");
});

test("기획 검색(en) — 검색어 계획, 풀이 비면 site: 금지, 후보 8~12건, 나열형 주제는 공통점으로", () => {
  en();
  const empty = P.buildTopicSeedSearchPromptEn({ id: "C1", topic: "10 Korean words", hint: null, midTopic: "Korean Language", poolHosts: [], maxSearches: 8 });
  assert.match(empty, /Plan the queries before searching/);
  assert.match(empty, /The pool list is empty; do not use site:/);
  assert.match(empty, /return 10 to 12 candidates that fit .* at most 3 from one publisher/);
  assert.match(empty, /explain the items one by one .* Keep the list\./);
  assert.match(empty, /If the topic is a list/);
  assert.match(empty, /At most 8 searches/);
  const pooled = P.buildTopicSeedSearchPromptEn({ id: "C1", topic: "x", hint: null, midTopic: "K-Food", poolHosts: ["korea.net"], maxSearches: 12 });
  assert.match(pooled, /Pool sites \(known to be readable\): korea\.net/);
  assert.doesNotMatch(empty + pooled, HANGUL);
});
