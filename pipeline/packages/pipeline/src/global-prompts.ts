/**
 * 글로벌판(PIPELINE_LOCALE=en) 대본 프롬프트 — 설계·대본·수정·축 심사 (KAN-201 영어 규칙 · 글로벌 명세 4.5·6.4).
 * 한국판 빌더를 번역하지 않고 새로 썼다: 동작(입력·출력 계약·워커가 검사하는 표기)만 같고 지시문은 영어 규칙(guidelines en-v0.x)을 따른다.
 * 모델이 읽는 글이라 영어다. 워커는 호출 지점에서 로케일로 고른다 — 한국판 빌더는 손대지 않는다.
 * 런타임 import 는 locale.js·series.js 만 한다(index.ts 와의 순환을 피한다 — index 는 이 파일을 다시 내보낸다. series.js 는 아무것도 import 하지 않는다).
 *
 * 워커가 대조하는 표기(바꾸면 워커도 같이 바꾼다):
 * - 구성안: `Axis:` · `Section #n — 제목` · `  Question:` · `Estimated length: N min` (locale.ts outlineMarks · design-single.ts)
 * - 대본: `## [Intro]` 4구역 · `### #n 제목` · `[이름] E1 · 문장` (locale.ts scriptZones · draft-two-stage.ts twoStageViolationsEn)
 * - 발음 맵: 대본의 한국어 단어 전부, 힌트 없으면 빈 문자열 (글로벌 명세 6.7 — TTS 발음 누락 검사)
 */
import { otherSpeaker, scriptZones, speakerNames } from "./locale.js";
import { seriesDesignBlock, seriesWriteBlock } from "./series.js";
import type { BacklogCandidate, ClusterV2Input, DesignInlineInput, IntroStyle, PromptParts, ReinforceSearchInput, RevisionInlineInput, Templates, TopicSeedSearchInput, WriteInput } from "./index.js";

const fence = (s: string) => "````\n" + s.trim() + "\n````";
const explainerEn = () => speakerNames()[0];

/** 글로벌판 역사 모드 — 주제 Korean History & Society 의 사건형 축 후보만 (글로벌 명세 6.3: 역사 주제는 사건형 축 허용). 같은 주제의 현대 사회 편은 개념 축이다 */
export const HISTORY_TOPIC_EN = "Korean History & Society";
export const isHistoryCandidateEn = (c: Pick<BacklogCandidate, "mid_topic" | "axis_type">): boolean =>
  c.mid_topic === HISTORY_TOPIC_EN && (c.axis_type === "사건" || c.axis_type === "event");

/** 도입 방식 4종 — 인트로 템플릿 뒤 [Opening] 첫 턴을 어떻게 여는가. 기능만 적는다(문장을 적으면 대본에 복제된다, 한국판 v9.4 교훈).
 *  글로벌판 인트로는 질문 없이 주제 선언으로 끝난다(tpl-en-v1, 박수헌 2026-10-15) — 한국판처럼 "인트로 질문을 받는" 형태가 아니다 */
export const INTRO_STYLES_EN: readonly IntroStyle[] = [
  { key: "experience", label: "everyday scene", hint: "The explainer opens the Opening with one ordinary situation anyone could meet, marked as imagined in plain words. Two or three short turns stay in that scene before the first explanation. Do not start it with the same words each time." },
  { key: "object", label: "one object", hint: "The explainer opens the Opening with one concrete object and what it looks like. Two or three turns stay with it, and it becomes the first case of the topic." },
  { key: "question", label: "question back", hint: "The host opens the Opening with the first question a newcomer would ask about the topic, built from the topic name alone and holding no fact. The explainer asks back one short thing about why it matters to the host, and the host's answer, a guess or feeling, opens the first explanation." },
  { key: "thesis", label: "surprising claim", hint: "The explainer opens the Opening with one claimed fact that runs against what a newcomer would expect. The host reacts or doubts for two or three turns. Start with the fact itself, not an announcement." },
];

const variants = (t: Templates | null | undefined) => (t?.closing_signoff ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

/** 템플릿 블록 — 슬롯 이름은 영어 템플릿의 계약: {topic_line}(주제별 고정 한 줄, major_lines) · {episode_line}(이 편의 축 한 줄). 그 밖의 {slot} 은 이 편의 내용으로 채운다 */
function templateBlockEn(t: Templates | null | undefined, topic: string | undefined, seed: number, seriesLine?: string): string {
  if (!t) return "- Templates are not set. Write a plain one-turn intro by the host and a plain one-turn sign-off by the host.";
  const line = seriesLine || (topic && t.major_lines?.[topic]) || "";
  const v = variants(t);
  const signoff = v.length ? v[Math.abs(seed) % v.length] : null;
  return `- **Intro template** (Y1, one turn by the host; keep the frame, fill only the {slots}, no braces may remain; the turn ends with the template — no question after it):
${fence(t.intro)}
  - {topic_line} = ${line ? `"${line}" (fixed text, use it word for word)` : `one plain sentence that introduces the topic "${topic ?? "-"}" to anyone`}
  - {episode_line} = this episode's axis in one line a listener catches by ear, not the title repeated
- **Closing lead template** (the host; keep the frame):
${fence(t.closing)}
  - {episode_recap} = the same topic as {episode_line} in one line, in different words. Do not reuse the intro's wording. Name the topic, not the answer.
  - {host_remark} = one question in the host's own words that asks the explainer to bring the episode together around the axis question: why people do it. Not a feeling, a reaction, or a request for advice; do not repeat the intro's line.
  - After it, one explainer wrap-up turn that answers that question (guidelines, Closing rule).${signoff ? `
- **Sign-off template** (the last turn of the script, by the host; fixed text, say it word for word and add nothing):
${fence(signoff)}` : ""}`;
}

const historyWriteEn = `- **History mode**: this episode's axis is an event. Tell what happened, when, to whom, and how, in the outline's order (background, course, result, interpretation). Years, names, places, and numbers of the time are content. Interpretations belong to their source, introduced once; if several disagree, set them side by side. The host asks why and what happened next, and never states an interpretation first. Open the Opening with one scene from the event instead of the intro style.`;
const historyDesignEn = `## 0. History mode — this candidate's axis is an event
- axis_type is "event". The axis sentence holds the event and the question of how to read it.
- Sections follow the event: background, course (2 to 3 sections in time order), result, interpretation (landing). Each Question line asks what a listener would ask at that point.
- Years, names, places, and numbers of the time are content; put them in the claims.
- Mark interpretation sources opinion=true. Put disagreeing interpretations side by side in the landing section.`;

function candidateAxisBlockEn(c: BacklogCandidate): string {
  if (!c.axis) return `- Backlog angle (reference only): ${c.angle ?? "(none)"}`;
  const roles = c.sources.map((s, n) => `S${n + 1} ${s.publisher}: ${(s.roles ?? []).map(roleEn).join(", ") || "no role"}`).join(" / ");
  return `- **Backlog axis (starting point)**: [${axisTypeEn(c.axis_type ?? "")}] ${c.axis}
- Backlog roles: ${roles}${c.gaps?.length ? `
- Empty roles: ${globalGaps(c.gaps).map(roleEn).join(", ") || "none"} — fill them from the text if you can; otherwise write "none" in the outline's role table` : ""}
- If the axis does not hold after reading the sources, change it and write "axis changed: reason" in notes.`;
}

// ── 1단계 설계 ────────────────────────────────────────────────────────────────

export function buildDesignPromptInlinePartsEn(i: DesignInlineInput): PromptParts {
  const history = isHistoryCandidateEn(i.candidate);
  const explainer = explainerEn();
  const host = otherSpeaker(explainer);
  const srcBlocks = i.sources.map((s) => {
    const head = `### S${s.n}. ${s.publisher} — "${s.title}"${s.backbone ? " (backbone)" : ""}\n- URL: ${s.url}${s.published ? ` · published ${String(s.published).slice(0, 10)}` : ""}${s.byline ? ` · author ${s.byline}` : ""}`;
    if (!s.ok) return `${head}\n- **No text** (${s.note ?? "fetch failed"}) — exclude this source and give the reason in sources_excluded.`;
    const used = s.usedBlocks ?? [];
    const usedNote = used.length ? `\n- **${used.length} paragraphs already used** by ${[...new Set(used.map((u) => u.by))].join(", ")} — the ⛔ paragraphs below cannot be used. Use other passages, or exclude this source if what is left is thin.` : "";
    const all = [...s.blocks.map((b) => ({ id: b.id, line: `[${b.id}] ${b.text}` })), ...used.map((u) => ({ id: u.id, line: `[${u.id}] ⛔ (already used by ${u.by})` }))]
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return `${head}${s.note ? `\n- Extraction note: ${s.note}` : ""}${usedNote}\n${all.map((x) => x.line).join("\n")}`;
  }).join("\n\n");
  const system = `You are the planner for "ear", an audio service. You do not write the script. You read the sources and produce the material (excerpts, claims) and the outline. The next stage never sees the sources, only what you produce. A fact that is not in your excerpts cannot appear in the script, so select generously.

There are no tools. All source text is in the next message with paragraph IDs. Do not search or add from memory. You select excerpts; you do not write them. Return paragraph IDs and the worker copies the original text.

Sources may be in Korean or English. Write everything you produce in English.

## 1. Script rules (plan so the script can follow them)
${fence(i.guidelines)}

## 2. Output fields

### a) excerpt_ids
- 10 to 20 paragraph IDs per source: main claims, numbers and how they were gathered, concrete cases, the author's limits and caveats, practices. Missing material costs more than extra material.
- Every ID a claim cites must be in excerpt_ids.
- gists: three lines per source, in English. Add nothing the excerpts do not say.
- Exclude sources with no or too little text and give the reason in sources_excluded. Keep at least three sources. If fewer remain, do not build an outline; say so in notes.

### b) claims
- Each claim: id (C01…) · text (one English sentence) · excerpt_ids · type (number, quote, name, cause, definition, practice) · section (the Body section that uses it; claims from one source may go to different sections) · notable (true only for people or institutions a general listener knows by name) · opinion (true for a person's opinion, interpretation, or forecast, or a contested or interested claim).
- A claim is never more specific than its excerpt. Keep the excerpt's hedges and the subject it attributes to. For a Korean excerpt, translate the meaning exactly; do not add or soften.
- Keep every condition the excerpt attaches: who says it, to whom, where, and which meanings it covers. When one condition covers several meanings, say so in each claim that states a meaning. Keep a named set as named; do not widen it into a general category.
- Keep each condition on the thing it describes. When an excerpt says one thing varies but another stays fixed, the claim keeps that contrast.
- Keep the excerpt's quantifiers (some, many, most, a few) and the subject it gives a practice. A practice of one named person stays that person's; claims from one excerpt use the same subject.
- When a Korean excerpt describes a whole place or group with a modifier, the claim keeps it describing the whole; do not turn it into a subset.
- A definition claim keeps who uses the term and how widely. An event at a specific time keeps its time and the past tense. A practice the excerpt places in the past stays in the past tense; a current practice is in the present tense.
- The subject of a claim is the practice, the people who do it, or the thing. Never make the source, its writer, or its year the subject ("The 2026 description says"). An opinion claim states the view itself and sets opinion to true.
- Write a guide's or a rule's instruction ("should", "are instructed to", "are required to") as what people do: who does what, where, and when, and keep who the instruction is for (learners, visitors, newcomers). A rule or schedule for one year or one event keeps that year as a condition. A scene the excerpt says happens every year is a practice, not a single event.
- Write each claim in plain spoken English. Do not copy a word-for-word noun phrase from a Korean excerpt.
- Keep the excerpt's evaluation of a number, such as a large or small change. A list the excerpt marks as partial stays partial in the claim.
- Keep in the claims the Korean words, the scope, and the differences by region, age, family, or setting that the excerpts give. Do not drop them to save space.
- Do not define a term the excerpts do not define. Leave its meaning out of the claims.
- For a Korean word, keep in the claims whether the excerpt calls it casual or polite and who uses it.
- In a Korean Language episode, keep one example phrase per featured word from the excerpts as a claim of type quote: the phrase romanized, its meaning, and its speech level read from the Hangul ending (casual, polite with -yo, or formal with -seumnida). Say when the phrase is a dictionary form ending in -da. Add who says it to whom only when the excerpt says so; otherwise leave the relationship out of the claim. An example sentence from a dictionary or learning guide is allowed; a line from a drama, song, or show is not.
- Romanize Korean words with Revised Romanization, even when an excerpt spells them another way. Names of people, groups, companies, and works keep their official English spelling.
- A person known to the public by name appears only through verifiable public facts. Do not make a claim from rumor, private life, or controversy. An unnamed person's own account of a family event or practice is a case.
- When a case or scene has short words people say, keep those words as a claim of type quote, as the excerpt has them.
- When an excerpt tells a person's own words, memory, or experience, keep it as a case or quote claim with that person. Do not turn it into a summary claim without the person.
- The subject of a claim is never a survey, an assessment, a critique, or survey respondents. State what people do, or state the view itself with opinion set to true.
- Keep scope words such as especially, mainly, and only. Keep every item of a named set; a plainer word replaces a word, it does not drop an item.
- Links between sources are not claims; put them in the outline's links list.

### c) outline_md — the contract for the script stage. Use exactly this format:
\`\`\`
# Outline — {episode ID}

Axis: [question|contrast|paradox|redefinition${history ? "|event" : ""}] one sentence
Axis note: why a newcomer wants this answered, two lines
Familiar picture: what a listener abroad already pictures or assumes about this topic, in plain words
Terms: each place, object, or role the episode names often — the one plain English name the script uses for it, as a name only, with no explanation; leave out common English words
Landing section: #n — where the axis is proven
Estimated length: n min

Roles
- Axis source: S? (the source the axis rests on most, or "none")
- Section order: one line on why #1 to #n are steps toward the axis
- Cases: S?
- Practice: S?
- History and context: S? (or "none")
- Counterpoints and limits: S? (or "none")
- Numbers and surveys: S? (or "none")
Unused sources: S? — reason

Section #1 — Title
  Purpose: what the listener keeps, one line
  Question: the sub-question of the axis this section answers
  Material: C01, C03 (S1) · C07 (S3)
  Host question: one question built only from earlier sections, or "the explainer opens"
  Opens with: the situation or question that opens the section — never its answer, never the source's name
  Scene: one concrete moment from a claim that has a person, a place, and an action, plus one detail from the claims (words said, an object, a sound), from C##; or "none"
  Insider detail: the Korean name people use for the thing, an everyday practice, or how people around them do it, from C##; never a source name; or "none"
  Transition: one device, different from the previous section
  Ratio: n%
Section #2 — …

Links and metaphors (made by the script, not facts)
- "X carried over to Y" — based on C##, in section #n

Closing line: one sentence with the answer to the axis question and its reason, drawn from the sections' claims; when the sections give several reasons, the one idea that joins them; never one section's reason as the only cause, never a list of the sections, never three items joined by "and"
\`\`\`
Planning rules:
- The axis is a question a newcomer asks about the practice ("Why do people in Korea …?"; a "how" question belongs to a section, not the axis), a contrast ("A, yet B"), a paradox ("trying A leads to B"), or a redefinition ("A is really B")${history ? ", or, in history mode, an event" : ""}. Keep the backlog's form. "What is X" is not an axis. ear introduces Korean culture: the episode shows how the practice works, who does it, and why.
- Sections are steps of the axis, not the order of a source. For a practice, follow the order in which it happens or the steps a newcomer needs. Give each section the claims that answer its question, from any source; a section usually draws on two or more sources. Do not build a section from one source alone when another source has claims for its question. Drop a source that answers no sub-question of the axis. A result or side effect, such as an environmental cost, goes in one or two sentences at the end of the section it follows, not in a section of its own. A survey from outside Korea supports at most one section and is never its main material.
- A list topic keeps its list: sections may follow the items or groups of items, and each section still answers a sub-question of the axis. The count in the title matches the items the material supports.
- Three to five Body sections. Fewer, fuller sections are better than many thin ones. The Opening is not a section.
- Plan scenes. Select excerpts with cases and practices so scenes are possible, and aim for a Scene in at least half of the Body sections. Build a Scene only from a claim with a person, a place, and a moment that carries words said, an object, or a sound. A person named only by name, age, or place in a report is not a scene. A general custom, a procedure, or a possible mistake is not a scene. Prefer a moment with words people say. For a drama or film topic, select excerpts that describe one specific moment: who, what they do, and what is said or left unsaid. When no claim has such a moment, write "none". Do not plan an imagined listener, viewer, visitor, or family as a scene.
- Plan the insider. The explainer is a calm Korean insider. Give each section an Insider detail when the material has one: the Korean name people use, an everyday practice, or how people around them do it. Take it from claims and add any Korean term to pronunciations.
- Name the Familiar picture so the Opening can start from it: one thing any listener abroad already knows, in plain words, not a detail of the practice. The episode then explains or changes that picture.
- Do not let source order become the episode. If every section uses one source in the order the sources are listed, rebuild the order around the steps of the axis. A section opens on its scene, a detail, or the host's question. Sources are not named in lines; the app lists them.
- A redefinition axis needs the members of the category heard: assign claims that name the kinds, forms, or examples, not only a single figure about one of them.
- Plan a limitation or a disagreement only when the claims state one, once, in the section where it applies. Do not add doubt the sources do not have.
- The axis and the Closing line keep the conditions and degree words of the claims they rest on. The Closing line's reason is a cause a claim states; do not repeat a reason the Opening or #1 already gave as the only reason.
- Write the axis, the questions, and the Closing line in plain spoken words a second-language listener knows. Avoid abstract nouns such as care, viewpoint, role, or preparation unless the section explains them; the script reuses these lines.
- The Host question uses only what came before; it never contains the section's new case, number, or result. Never ask about methods, samples, or limits.
- Estimated length comes from the material: 5 minutes is the floor, and there is no target length. Do not inflate it. If the material cannot reach 5 minutes, do not build an outline; say why in notes. If it is 20 minutes or more, put a split plan in split_proposal and still build one outline.
- Every C## in the outline exists in claims.
- Topic limits (guidelines rule 7) apply to the plan: no section built on prices, opening hours, transport, product recommendations, or plot summary.

### d) pronunciations
- Every Korean word and Korean name the script will use, as romanized in the claims. reading = the same word written in Hangul, exactly as Koreans write it. Write the term by Revised Romanization of the reading, sound changes included; do not copy an excerpt's spelling. Names of people, groups, companies, and works keep their official English spelling. The voice reads the Hangul in Korean. For a name, give the Korean name in Hangul. Leave reading empty when you cannot give one; a person fills it before audio.
- Do not list English words or a romanized word that is also a common English word.
- Do not list a name that listeners abroad already say in English: a place, company, group, or work with an established English name, or a person known abroad by an English form of the name. The voice reads these in English. List every other name, including people's names, in Hangul. Never list the speakers' names.

## 3. Report — output only the requested JSON. No text before it.`;
  const user = `${history ? historyDesignEn + "\n\n" : ""}## Episode (backlog ${i.candidate.id}, gate 1 approved)
- Episode ID: ${i.episodeId} · working title: "${i.candidate.title}" · topic: ${i.candidate.mid_topic}
- The first line of outline_md is exactly "# Outline — ${i.episodeId}".
- Explainer: **${explainer}** / host: **${host}** — fixed roles.
- Listener: a general listener new to this topic, often with English as a second language.
${candidateAxisBlockEn(i.candidate)}${seriesDesignBlock(i.series, true)}

## Source text (${i.sources.length} sources — cite by paragraph ID)
${srcBlocks}

Plan by the rules above and output only the report JSON.`;
  return { system, user };
}

const strArr = { type: "array", items: { type: "string" } } as const;
export const DESIGN_INLINE_SCHEMA_EN = {
  type: "object",
  additionalProperties: false,
  required: ["axis", "axis_type", "landing_section", "axis_source", "sections", "excerpt_ids", "gists", "claims", "outline_md", "pronunciations", "estimated_minutes", "split_proposal", "sources_used", "sources_excluded", "gaps", "notes"],
  properties: {
    axis: { type: "string" },
    axis_type: { type: "string", enum: ["question", "contrast", "paradox", "redefinition", "event"] },
    landing_section: { type: "integer" },
    axis_source: { type: "string", description: "The source the axis rests on most, as \"S3\" only (no URL or title). Empty string if none" },
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "title", "sources", "ratio"], properties: { n: { type: "integer" }, title: { type: "string" }, sources: strArr, ratio: { type: "integer" } } } },
    excerpt_ids: { ...strArr, description: "Selected paragraph IDs (S1-03 …)" },
    gists: { type: "array", items: { type: "object", additionalProperties: false, required: ["s", "lines"], properties: { s: { type: "integer" }, lines: strArr } }, description: "Three English lines per source" },
    claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "text", "excerpt_ids", "type", "section", "notable", "opinion"], properties: { id: { type: "string" }, text: { type: "string", description: "One English sentence, no more specific than the excerpt" }, excerpt_ids: strArr, type: { type: "string", enum: ["number", "quote", "name", "cause", "definition", "practice"] }, section: { type: "integer", description: "Body section that uses this claim. Claims of one source may go to different sections" }, notable: { type: "boolean", description: "True only if a general listener knows the person or institution by name" }, opinion: { type: "boolean", description: "A person's opinion, interpretation, or forecast, or a contested or interested claim" } } } },
    outline_md: { type: "string", description: "The full outline.md" },
    pronunciations: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string", description: "Korean word or name, romanized as in the script" }, reading: { type: "string", description: "The word in Hangul as Koreans write it, or empty if unknown" } } } },
    estimated_minutes: { type: "number" },
    split_proposal: { type: "string", description: "Split plan when 20 minutes or more, else empty" },
    sources_used: strArr,
    sources_excluded: { type: "array", items: { type: "object", additionalProperties: false, required: ["url", "reason"], properties: { url: { type: "string" }, reason: { type: "string" } } } },
    gaps: { ...strArr, description: "Empty roles" },
    notes: { type: "string" },
  },
} as const;

/** 설계 재요청 문구 — 모델이 읽는다 (design-single.ts 의 질문 누락·축 심사 반려) */
export const designMissingQuestionsEn = (heads: number, qs: number) =>
  `\n\n## Outline returned — format\n${heads} sections but ${qs} "Question:" lines. Give **every** section its sub-question of the axis in a "Question:" line and return the same outline. Keep the axis, the section count, the material, the excerpts, and the claims.`;
export const designAxisRejectEn = (axis: string, reasons: string, note: string) =>
  `\n\n## Axis check — outline returned\nAxis: ${axis}\nSections that do not answer the axis question:\n${reasons}\n${note}\n**Drop these sections** (list their sources as unused; three sources is the only floor) and rebuild with the rest, or set an axis that all sources answer. Keep the excerpt and claim IDs valid.`;

// ── 축 심사 ────────────────────────────────────────────────────────────────

export function buildAxisCheckPromptPartsEn(i: { outlineMd: string; history?: boolean }): PromptParts {
  const system = `You review outlines for "ear", an audio service. You do not write scripts. Compare the outline's axis with each section's Question line and judge whether each section is a step toward the axis question.
- The axis is the one question a listener holds for the whole episode. Each section's question moves one step toward it.
- A section that drifts to a neighboring topic is false, even if it shares a broader idea.
- A case, practice, or counterpoint section is true only if it stays inside the axis's subject. Check the section's material too: a case from a different setting that only shows the same principle is false.
- The landing section's question is the axis question itself. A question axis is answered by how the practice works and why people do it.
- Judge strictly: when unsure, mark false and say why. An outline with only three sections passes if all three hold.${i.history ? `
- History mode: the axis is an event. Sections follow its background, course, result, and interpretation. A section about that event is true; a section about another event or a general idea is false. Do not fail an outline because its axis is an event.` : ""}
Output only the requested JSON.`;
  const user = `## Outline\n\n\`\`\`\n${i.outlineMd.trim()}\n\`\`\`\n\nJudge each section and give the verdict.`;
  return { system, user };
}
export const AXIS_CHECK_SCHEMA_EN = {
  type: "object", additionalProperties: false, required: ["axis", "sections", "verdict", "note"],
  properties: {
    axis: { type: "string", description: "The outline's axis sentence, copied" },
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "question", "answers_axis", "why"], properties: {
      n: { type: "integer" }, question: { type: "string", description: "The section's Question line (or its Purpose line if missing)" },
      answers_axis: { type: "boolean", description: "Does answering this bring the listener one step closer to the axis question? A drift to a neighboring topic is false" },
      why: { type: "string", description: "One sentence" } } } },
    verdict: { type: "string", enum: ["pass", "fail"], description: "fail if any section is false" },
    note: { type: "string", description: "If fail: which sections to drop or how to reset the axis, two sentences" },
  },
} as const;

// ── 2단계 대본 ────────────────────────────────────────────────────────────────

/** 대본 단계 — 골드는 아직 없다(글로벌 명세 7장: 파일럿 판정 상위 편을 골드로 올린다). 골드 등록 뒤 이 빌더에 절을 더한다 */
export function buildWritePromptPartsEn(i: WriteInput): PromptParts {
  const explainer = explainerEn();
  const host = otherSpeaker(explainer);
  const z = scriptZones();
  const minutes = i.estimatedMinutes ?? 15;
  const system = `You are the script writer for "ear", an audio service. You write a two-person podcast script for a general listener who is new to the topic and often speaks English as a second language.

There are no sources and no tools at this stage. Everything you need is in these instructions and the next message. The only facts you may use are in claims.md. The outline is the contract. Do not add from memory; a script with a fact outside the excerpts is discarded.

## 1. Rules — guidelines (${i.promptVersion})
${fence(i.guidelines)}

There are no gold examples yet. Follow the guidelines and the templates.

## 2. Format (the parser and checks read it exactly)
- First line (meta): \`Episode ID · Title · Topic · ${explainer}/${host} · ${i.promptVersion} · Sources used\`
- Zones: \`## [${z.intro}]\` \`## [${z.lead}]\` \`## [${z.body}]\` \`## [${z.outro}]\`, once each, in this order.
- Inside ${z.body}, each section starts with \`### #n Title\`, with the outline's numbers and order.
- Turns: \`[${explainer}] E1 · sentence\` and \`[${host}] Y1 · sentence\`. Label first, then the number, then a middle dot (·). E is the explainer, Y the host, each numbered from 1.
- The last turn is the host's sign-off.

## 3. Report — output only the requested JSON. Put the whole script.md in script, from the meta line to the last turn. Do not write the script or any text before the JSON.`;
  const user = `## This episode (backlog ${i.candidate.id})
- Episode ID: ${i.episodeId} · working title: "${i.candidate.title}" · topic: ${i.candidate.mid_topic}
- Explainer: **${explainer}** / host: **${host}** — fixed roles.
- You may write a new title that fits the axis. No clickbait.
${templateBlockEn(i.templates, i.majorTopic ?? i.candidate.mid_topic, i.signoffSeed ?? 0, i.series?.introSentence)}
- Opening style: **${i.introStyle.label}** — ${i.introStyle.hint}${isHistoryCandidateEn(i.candidate) ? "\n" + historyWriteEn : ""}
- The outline's lines, the Terms line included, are instructions, not dialogue. Do not copy their wording into turns. Stage a Scene only where the outline plans one; do not add an imagined viewer or visitor.
- **Length target: about ${minutes} minutes = about ${Math.round(minutes * 146)} spoken words (within 10 percent).** The floor is 730 words. The outline's estimate already reflects the material; writing longer means the explanation got wordy.${seriesWriteBlock(i.series, true)}

## Material
### Outline — outline.md (the contract: section order, purpose, material, host question, transition)
${fence(i.outlineMd)}

### Claims — claims.md (every fact you may use)
${fence(i.claimsMd)}

### Excerpts — sources.md (the source of each claim; match strength and wording to these)
${fence(i.sourcesMd)}

### Pronunciation map — pronunciations.json (romanized Korean words and their readings)
${fence(i.pronunciationsJson)}

Write by the rules above and output only the report JSON.`;
  return { system, user };
}

export const WRITE_SCHEMA_EN = {
  type: "object",
  additionalProperties: false,
  required: ["title", "one_liner", "script", "sections_followed", "turn_claims", "bridges", "terms", "pronunciations_added", "self_check_fixes", "notes"],
  properties: {
    title: { type: "string" },
    one_liner: { type: "string", description: "At most 12 words: this episode's axis in listener language. Not a claim. Do not repeat the title" },
    script: { type: "string", description: "The full script.md (markdown)" },
    sections_followed: { type: "boolean", description: "Outline section order and count kept" },
    turn_claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "claims"], properties: { turn: { type: "string" }, claims: { type: "array", items: { type: "string" } } } }, description: "Claim IDs used in each explainer turn. IDs appear only here, never in the script" },
    bridges: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "note"], properties: { turn: { type: "string" }, note: { type: "string", description: "What was carried over to what · based on C##" } } }, description: "Every new link, metaphor, or hypothetical scene not in the outline" },
    terms: { type: "array", description: "Every Korean word and every term a B2 listener would not know, with its first turn and how it is explained. Not common English words", items: { type: "object", additionalProperties: false, required: ["term", "turn", "explained_by"], properties: { term: { type: "string" }, turn: { type: "string", description: "First turn id (E7)" }, explained_by: { type: "string", description: "The explaining sentence, or the host turn id that asks (Y8)" } } } },
    pronunciations_added: { type: "array", description: "Korean words or names in the script that are not in the pronunciation map", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string" }, reading: { type: "string", description: "The word in Hangul as Koreans write it, or empty if unknown" } } } },
    self_check_fixes: { type: "array", items: { type: "string" } },
    notes: { type: "string", description: "Up to three sentences: where the explainer asks the host, the metaphors used, length judgment, any material shortfall" },
  },
} as const;

// ── 수정 재생성 ────────────────────────────────────────────────────────────────

export function buildRevisionPromptInlinePartsEn(i: RevisionInlineInput): PromptParts {
  const failures = i.qaFailures.map((f, n) => `${n + 1}. [${f.location}] ${itemLabel(f.item)}: ${f.reason}`).join("\n");
  const explainer = explainerEn();
  const system = `You are the script writer for "ear", an audio service. QA (fact check) or the format check (L0) failed this script. Make the **smallest fix** that resolves every finding.

There are no tools. Everything is below. Return only the full text of each turn you change; the worker replaces those turns.

## Fix rules
- Change only the turns the findings point to, plus turns that refer back to text you removed. Do not rewrite the script.
- Fix toward the excerpts: delete or narrow any comparison, direction, date, or detail the excerpts do not support. Do not add excerpts or facts.
- Lower hedges, the attributed subject, and details to the excerpt's level. Never raise certainty.
- If a host question assumes something not yet explained, remove it from the question and ask only from earlier explainer turns. If the link breaks, add one opening sentence at the end of the previous explainer turn and include that turn.
- When a finding names turns, fix every named turn.
- Length findings: keep the material; shorten wordy turns, or fill from unused claims if short. A turn has at most 6 sentences.
- Do not change zone headers, section headers, or turn numbering. To delete a turn, set after to an empty string.
- Write every changed sentence as speech: one idea per sentence and a short subject. To add a condition, split the sentence.
- When a fix removes a case, scene, or claim, also rewrite the turns that lead into it or answer it, and include them. Leave no turn that only repeats the previous turn or answers nothing.
- If a fix adds a Korean word, add it to pronunciations_added (reading empty if unknown).
- For each changed turn, list every claim ID it still uses in claims. Empty if the turn was deleted or uses none.

## Script rules (reference)
${fence(i.guidelines)}

## Report — output only the requested JSON. turn is the turn number ("E12", "Y7"). after is the full spoken text of the turn, without label, number, or middle dot. before is the first 30 characters of the old text. No text before the JSON.`;
  const user = `## This fix — attempt ${i.attempt}/3

## Findings (resolve all)
${failures}

## script.md (to fix — line format \`[${explainer}] E1 · sentence\` / \`[${otherSpeaker(explainer)}] Y1 · sentence\`)
${fence(i.scriptMd)}

## claims.md (every fact you may use)
${fence(i.claimsMd)}

## sources.md (excerpts — the final reference)
${fence(i.sourcesMd)}
${i.outlineMd ? `\n## outline.md (section contract — keep the structure)\n${fence(i.outlineMd)}\n` : ""}
## pronunciations.json
${fence(i.pronunciationsJson)}

Fix by the rules above and output only the report JSON.`;
  return { system, user };
}

export const REVISION_INLINE_SCHEMA_EN = {
  type: "object",
  additionalProperties: false,
  required: ["fixes", "pronunciations_added", "claims_note", "notes"],
  properties: {
    fixes: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "before", "after", "why", "claims"], properties: { turn: { type: "string" }, before: { type: "string" }, after: { type: "string" }, why: { type: "string" }, claims: { type: "array", items: { type: "string" }, description: "Every claim ID the turn still uses after the fix (C01). Empty if deleted or none" } } } },
    pronunciations_added: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string" }, reading: { type: "string", description: "The word in Hangul as Koreans write it, or empty if unknown" } } } },
    claims_note: { type: "string", description: "Text for a 'QA changes' note at the end of claims.md: which claims were narrowed or removed, and how" },
    notes: { type: "string" },
  },
} as const;

// ── QA ────────────────────────────────────────────────────────────────

export interface QaInlineInputEn { episodeId: string; attempt: number; qaPromptMd: string; specQaMd: string; scriptMd: string; claimsMd: string; sourcesMd: string; priorFailures?: { location: string; item: string; reason: string }[]; fixes?: { location: string; before: string; after: string }[]; humanRevision?: boolean }

/** 실패 항목 표기 — QA 는 번호("8"), L0 는 이름("L0 format contract")을 낸다 */
const itemLabel = (item: string) => (/^\d+$/.test(item.trim()) ? `check ${item.trim()}` : item);

/** 글로벌판 QA (spec/05 global · 명세 6.5). 독립 실행 — 입력 3종 + QA 자산 + spec/05 만. 생성 맥락을 넣지 않는다 */
export function buildQaPromptInlinePartsEn(i: QaInlineInputEn): PromptParts {
  const prior = i.attempt > 1 && (i.priorFailures?.length || i.fixes?.length)
    ? `
## Previous round (attempt ${i.attempt - 1}) — stability rules
These are the previous round's failures and the writer's changes. The writer's reasoning is not included; only what changed.
### Previous failures
${(i.priorFailures ?? []).map((f, n) => `${n + 1}. [${f.location}] ${itemLabel(f.item)}: ${f.reason}`).join("\n") || "- (none)"}
### Writer's changes
${(i.fixes ?? []).map((f, n) => `${n + 1}. ${f.location}\n   before: ${f.before}\n   after: ${f.after}`).join("\n") || "- (none recorded)"}

Rules:
1. First judge whether each previous failure is resolved: the new text is within the excerpts, and the change did not break a reference in another turn.
2. A sentence that did not change passed last round. Fail it now only for a clear factual error (a number, date, or attribution that differs from the excerpt; a name, quote, or conclusion not in the excerpts). Record borderline differences in hedging or wording as notes, not failures.
3. New or changed sentences get the same strictness as round 1.`
    : "";
  const human = i.humanRevision ? "\n(A person edited this script and asked for QA again. Human edits can add errors too; check everything with round-1 strictness.)" : "";
  const system = `You are the QA checker for "ear", an audio service. You verify that the script says only what the sources say, and no more. You know nothing about how the script was made; that is the rule.

There are no tools. Everything is below. Do not read files or open URLs. The excerpts are the final reference.

## 1. QA procedure and checks (asset — follow its checks and rules exactly)
${fence(i.qaPromptMd)}

## 2. QA spec — spec/05
${fence(i.specQaMd)}

## 3. Report — output only the requested JSON. In report_md, write in markdown: "### Checks" (a table with 11 rows: #, check, verdict pass/fail/hold, one-line basis) · "### Failures" (a table: #, location as "Y7 · first words", check, reason; "none" if none) · "### Notes — borderline cases not failed" · "### Verdict". The failures array and the failures table hold the same items. No text before the JSON.`;
  const user = `## Under check — ${i.episodeId} attempt ${i.attempt}${human}
Speakers (check 10): explainer ${explainerEn()} (E turns), host ${otherSpeaker(explainerEn())} (Y turns).
${prior}

### Script — script.md
${fence(i.scriptMd)}

### Claims — claims.md (a map for checking, not the final reference)
${fence(i.claimsMd)}

### Excerpts — sources.md (the final reference)
${fence(i.sourcesMd)}

Check by the procedure above and output only the report JSON.`;
  return { system, user };
}

export const QA_INLINE_SCHEMA_EN = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "failures", "holds", "resolved_prior", "report_md", "summary"],
  properties: {
    verdict: { type: "string", enum: ["qa_passed", "failed"] },
    failures: { type: "array", description: "Empty if and only if verdict is qa_passed", items: { type: "object", additionalProperties: false, required: ["location", "item", "reason"], properties: { location: { type: "string", description: "\"Y7 · first words\"" }, item: { type: "string", description: "Check number from spec/05, 1 to 11 only" }, reason: { type: "string", description: "Which expression differs from which excerpt, concretely" } } } },
    holds: { type: "array", items: { type: "string" }, description: "Checks held by rule (7)" },
    resolved_prior: { type: "array", items: { type: "object", additionalProperties: false, required: ["location", "resolved", "note"], properties: { location: { type: "string" }, resolved: { type: "boolean" }, note: { type: "string" } } }, description: "Whether each previous failure is resolved (round 2+). Empty in round 1" },
    report_md: { type: "string", description: "This round's report body in markdown" },
    summary: { type: "string" },
  },
} as const;

// ── 비평 (critic-v2 구조, 글로벌 명세 6.6) ────────────────────────────────────

export interface CriticInlineInputEn { episodeId: string; title: string; midTopic: string; rubricV2Md: string; guidelines: string; scriptMd: string }

/** 글로벌판 비평 — 루브릭·규칙은 시스템 블록, 대본은 사용자 메시지. 골드·앵커는 아직 없다. 리포트 머리·열 이름은 콘솔 파서(apps/web lib/artifacts.ts)가 읽는 영어판 */
export function buildCriticPromptInlinePartsEn(i: CriticInlineInputEn): PromptParts {
  const explainer = explainerEn();
  const system = `You are the script critic for "ear", an audio service. You judge style and structure independently. You know nothing about how the script was made, its QA result, or its code checks; that is the rule.

There are no tools. The rubric and rules are below; the script is in the next message. Put the report in report_md.

## 1. Critic rubric — follow its flag items (2.1), score bands (3), and report format (4)
${fence(i.rubricV2Md)}

## 2. Script rules — guidelines (the source of the criteria)
${fence(i.guidelines)}

## 3. Task
Write the full report in report_md in the rubric's section 4 format, from the title line to "## 4. Tally", in markdown. The guidelines address the writer; use their rules only as criteria and ignore their output and self-check instructions. In order:
1. **Scores (100)** — score the 12 sub-items one by one against their bands, each with a quote \`[E12] "…"\`. A score without a quote is invalid. The total is only the sum; do not adjust items to reach it. Score 3.10 as a whole. Anchor slots are empty in this run; use the band definitions alone. Leave the human columns empty.
2. **Flags** — only the items in 2.1, at most 15, each with a quote. Do not flag the items in 2.2. Leave the human columns empty.
3. **⭐ Strengths** — 3 to 5.
4. **Tally** — counts only.

## 4. Report JSON — output only the requested JSON. Each score and evidence entry matches report_md. No text before the JSON.`;
  const user = `## Script to judge — ${i.episodeId} "${i.title}" (explainer ${explainer} / host ${otherSpeaker(explainer)}, ${i.midTopic})
${fence(i.scriptMd)}

Score, flag, and star by the rubric above, put the full report in report_md, and output only the report JSON.`;
  return { system, user };
}

const intEn = { type: "integer" } as const;
const strEn = { type: "string" } as const;
/** 한국판 CRITIC_INLINE_SCHEMA 와 같은 키(워커가 합산·기록) — 설명만 영어 */
export const CRITIC_INLINE_SCHEMA_EN = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "evidence", "total", "violations", "suspects", "stars", "summary", "report_md"],
  properties: {
    scores: {
      type: "object", additionalProperties: false, required: ["content", "structure", "naturalness", "immersion", "persona"],
      properties: {
        content: { type: "object", additionalProperties: false, required: ["value", "argument", "perspective", "resonance"], properties: { value: intEn, argument: intEn, perspective: intEn, resonance: intEn }, description: "3.1 value /12 · 3.2 argument /8 · 3.3 variety /4 · 3.4 scenes and lived detail /11" },
        structure: { type: "object", additionalProperties: false, required: ["opening", "flow", "ending"], properties: { opening: intEn, flow: intEn, ending: intEn }, description: "3.5 opening /6 · 3.6 flow /8 · 3.7 ending /6" },
        naturalness: { type: "object", additionalProperties: false, required: ["spoken", "exchange"], properties: { spoken: intEn, exchange: intEn }, description: "3.8 spoken English /12 · 3.9 exchange /8" },
        immersion: { ...intEn, description: "3.10 immersion /15, as a whole" },
        persona: { type: "object", additionalProperties: false, required: ["voice", "listener"], properties: { voice: intEn, listener: intEn }, description: "3.11 voice and roles /5 · 3.12 listener's seat /5" },
      },
    },
    evidence: {
      type: "object", additionalProperties: false,
      required: ["content_value", "content_argument", "content_perspective", "content_resonance", "structure_opening", "structure_flow", "structure_ending", "natural_spoken", "natural_exchange", "immersion", "persona_voice", "persona_listener"],
      properties: { content_value: strEn, content_argument: strEn, content_perspective: strEn, content_resonance: strEn, structure_opening: strEn, structure_flow: strEn, structure_ending: strEn, natural_spoken: strEn, natural_exchange: strEn, immersion: strEn, persona_voice: strEn, persona_listener: strEn },
      description: "Evidence per sub-item — [turn] quote",
    },
    total: { ...intEn, description: "Sum of the 12 sub-items /100" },
    violations: intEn,
    suspects: intEn,
    stars: intEn,
    summary: { type: "string", description: "Overall verdict, three sentences" },
    report_md: { type: "string", description: "The full critic report in the rubric's section 4 format, markdown" },
  },
} as const;


// ── 주제 기획·보강 (모드 B-②·B-①, 글로벌 명세 6.1·6.3) ─────────────────────
// 모델에게는 영어 값으로 묻고, 저장 직전에 내부 값(한국어 코드)으로 바꾼다 — 게이트 1(apps/web lib/gate1.ts)·후보 검사(candidate-check.ts)·콘솔이
// 내부 값("근거 앵커"·"성립")을 읽기 때문이다. 화면에 보이는 역할 이름도 팀이 읽는 한국어 그대로다

// 2026-10-17 소개형 전환(박수헌 — 글로벌판은 한국 문화를 소개한다): 생활 관행(practice) 역할을 더하고, 반론·한계·수치·조사는 선택 역할이다 — 빈 역할(gaps)이 되지 않는다.
// 축 유형에 질문(question)을 더한다 — 처음 보는 사람이 그 관행에 대해 물을 질문 하나. DB 제약은 0030
export const ROLE_EN_TO_KO = { anchor: "근거 앵커", case: "사례", practice: "생활 관행", context: "역사·맥락", counterpoint: "반론·한계", numbers: "수치·조사" } as const;
export const AXIS_EN_TO_KO = { question: "질문", contrast: "대립", paradox: "역설", redefinition: "재정의", event: "사건" } as const;
/** 선택 역할(내부 값) — 있으면 쓰고, 비어도 빈 역할이 아니다 */
export const GLOBAL_OPTIONAL_ROLES = ["반론·한계", "수치·조사"] as const;
/** 글로벌판 역할 전체(내부 값) — 보강이 빈 역할을 고를 때 쓴다 */
export const GLOBAL_ROLES = Object.values(ROLE_EN_TO_KO) as string[];
/** 빈 역할에서 선택 역할을 뺀다 */
export const globalGaps = (gaps: string[]) => gaps.filter((g) => !(GLOBAL_OPTIONAL_ROLES as readonly string[]).includes(g));
const REQUIRED_ROLES_EN = ["anchor", "case", "practice", "context"] as const;
const ROLES_EN = Object.keys(ROLE_EN_TO_KO) as (keyof typeof ROLE_EN_TO_KO)[];
const invert = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<string, string>;
const ROLE_KO_TO_EN = invert(ROLE_EN_TO_KO);
const AXIS_KO_TO_EN = invert(AXIS_EN_TO_KO);
/** 내부 값 → 모델에게 보일 영어 (모르는 값은 그대로) */
export const roleEn = (r: string) => ROLE_KO_TO_EN[r] ?? r;
export const axisTypeEn = (a: string) => AXIS_KO_TO_EN[a] ?? a;
const roleKo = (r: string) => (ROLE_EN_TO_KO as Record<string, string>)[r] ?? r;

const ROLE_INTENT_EN: Record<string, string> = {
  anchor: "research, an institution's explainer, or an expert account that directly answers the episode's question",
  case: "a concrete scene, story, interview, or report with a person, a place, and a moment: words said, an object, a sound",
  practice: "how people in Korea actually do it: the names they use, the steps, who does what, how it differs by region, age, or family",
  context: "where the practice came from, how it changed, the background of the idea",
  counterpoint: "optional: a disagreement inside Korea or a stated limit, only when a source has one",
  numbers: "optional: a survey or official statistics, only when they exist",
};
const ROLE_INTENT_HISTORY_EN: Record<string, string> = {
  anchor: "an account of the event as a whole: a history reference, an overview, a summary of records, a research institute's explainer",
  case: "a concrete scene, person, or record from the time: letters, diaries, court records, reports of the day",
  practice: "how people lived and did things at the time, from records",
  context: "the background and aftermath of the event",
  counterpoint: "optional: interpretations of the same event that disagree",
  numbers: "optional: figures recorded at the time: population, losses, costs, votes",
};
const roleIntent = (history: boolean) => (history ? ROLE_INTENT_HISTORY_EN : ROLE_INTENT_EN);
const historyTopic = (mid: string | null | undefined) => mid === HISTORY_TOPIC_EN;

const SEARCH_EXCLUDE_EN = `- Exclude what the worker cannot read: paywalled databases and repositories (researchgate, ssrn, academia.edu, semanticscholar, paid sciencedirect, springer, or wiley pages, jstor, DBpia, KISS, RISS), login or subscription walls, PDF-only links, social media, YouTube, wikis (including namu.wiki), forums, fan communities, shopping pages, and short press releases.
- Exclude Korean personal publishing: Naver or Daum blogs and cafes, Tistory, Brunch, Naver KnowledgeiN. For portal copies of news (n.news.naver.com, v.daum.net), return the original publisher's URL.
- English entertainment sites (Soompi, allkpop, Koreaboo and similar) are case material only, never the anchor.
- For Korean queries, write the Korean term in Hangul.
- ear does not report news. A news story is case material only.
- The two-year limit applies to numbers and to claims about current practice. Reference works, heritage explainers, and museum pages may be any age. A numbers source states the year its data describes.
- Topic limits: nothing about real people's private life, rumors, or controversies; no promotional pages of agencies or brands; for food and travel, no price, store, or booking guides; for drama and film, no plot summary as the anchor.
- One source may fill two roles. A source that only shares keywords is worse than none.
- publisher is the organization's official English name, written the same way every time. Sites of one organization count as one publisher.`;

/** 검색어 계획 (2026-10-15 — 첫 기획 C1: 8회 중 3회가 "site.host" 오기·따옴표 OR 묶음으로 낭비, 정확 구문 따옴표·연도 범위로 결과가 좁았다) */
const QUERY_PLAN_EN = `- **Plan the queries before searching.** At least one query per required role (anchor, case, practice, context), and about half in English and half in Korean. Use plain keywords: 3 to 7 words, no quotation marks except around a fixed name, no year ranges. Vary the angle between queries (the practice itself, its history, how people see it, numbers about it); do not repeat one query with small changes.
- Use site: only with a host from the pool list below, written exactly as site:host. Do not invent site: filters or combine them with OR.`;

/** 기획 검색 — 도구는 웹 검색만(본문 안 읽음). 한국어·영어 소스 둘 다 — K-컬처는 국문 1차 자료가 많다 */
export function buildTopicSeedSearchPromptEn(i: TopicSeedSearchInput): string {
  const history = false; // 주제 이름만으로는 사건형인지 모른다 — 아래 조건부 안내로 대신한다
  return `You find sources for "ear", an audio service that makes two-person English episodes about Korean culture for listeners mostly in Southeast Asia and Japan. A person chose one episode topic. Find sources for it by web search.
The only tool is web search. Do not read pages; the planner reads them later. Return what the results show: title, summary, publisher, date.

## Topic
- ${i.id} "${i.topic}" · topic area ${i.midTopic}${i.hint ? `\n- Note from the person: ${i.hint}` : ""}

## What to collect — roles
A candidate holds with 5 to 7 sources that fill these roles:
  · ${ROLES_EN.map((r) => `${r} — ${roleIntent(history)[r]}`).join("\n  · ")}${historyTopic(i.midTopic) ? "\nIf the topic is a past event: an account of the event as a whole is the anchor; an essay that uses the event as an example of another idea is not. Records from the time are cases. Older sources are fine." : ""}
The worker recounts: at least 3 sources · at least 3 publishers · no publisher over half · at least 1 anchor · at least 1 case · at least 3 roles. ear introduces Korean culture: spend searches on case and practice first. Find at least one source that tells a person's own moment: an interview, a first-hand account, or a report scene with words said. Counterpoint and numbers are optional.

## Search rules
- At most ${i.maxSearches} searches. Use them all unless every role is filled with strong sources. Korean institutions and Korean-language sources often hold the best material on Korean culture; English sources show how it is explained to outsiders.
${QUERY_PLAN_EN}
- Any publisher is fine if it fits. Prefer Korean public institutions and research bodies (national museums, heritage, language, and tourism agencies), universities, open-access journals, museums, and archives; then specialist and nonprofit media; then commercial news.${i.poolHosts.length ? `\n- Pool sites (known to be readable): ${i.poolHosts.slice(0, 40).join(", ")}` : "\n- The pool list is empty; do not use site:."}
- If the topic is a list ("10 words", "5 dishes"), find sources that explain the items one by one (dictionary entries, explainers on each item) and sources on what ties them together. Keep the list.
${SEARCH_EXCLUDE_EN}

## Report — output only the requested JSON. sources: return 10 to 12 candidates that fit (the judge picks 5 to 7, and some may turn out unreadable; meeting the minimum is not enough), at most 3 from one publisher, each with url (the result's exact URL), title, publisher, published (YYYY-MM-DD or null), summary (two English sentences from the result), roles, why (one line on the role), in_pool (true if the site is in the pool list). queries: every query you used. notes: roles not filled and why.`;
}

/** 보강 검색 — 후보 하나의 빈 역할(없으면 발행처 다양화). 풀 밖 결과는 in_pool=false 로 돌려준다(워커가 도메인 후보로만 등록) */
export function buildReinforceSearchPromptEn(i: ReinforceSearchInput): string {
  const c = i.candidate;
  const history = historyTopic(c.mid_topic) && (c.axis_type === "사건" || c.axis_type === "event");
  const pubCount = new Map<string, number>(); for (const x of c.sources) pubCount.set(x.publisher, (pubCount.get(x.publisher) ?? 0) + 1);
  const top = [...pubCount].sort((a, b) => b[1] - a[1])[0];
  const diversify = !c.gaps.length && top ? `more publishers — ${top[0]} has ${top[1]} of ${c.sources.length} sources. Find 1 to 2 anchors and 1 case from publishers not already in the list.` : null;
  const roles = (c.gaps.length ? c.gaps : ["근거 앵커", "사례"]).map(roleEn);
  return `You reinforce sources for "ear", an audio service that makes two-person English episodes about Korean culture. One candidate has an axis but empty roles. Find sources for those roles by web search. ear introduces Korean culture; counterpoint and numbers are optional.
The only tool is web search. Do not read pages. Return what the results show: title, summary, publisher, date.

## Candidate
- ${c.id} "${c.title}" · topic area ${c.mid_topic}
- Axis (${axisTypeEn(c.axis_type ?? "-")}): ${c.axis ?? "(none)"}
- Sources already in it: ${c.sources.map((x) => `${x.publisher} "${x.title}"`).join(" / ") || "(none)"}
- **Roles to fill**: ${roles.map((r) => `${r} — ${roleIntent(history)[r] ?? ""}`).join("\n  · ")}${diversify ? `\n- **Goal of this round**: ${diversify}` : ""}

## Search rules
- At most ${i.maxSearches} searches, in English and Korean.
${QUERY_PLAN_EN}
- Pool sites (known to be readable): ${i.poolHosts.join(", ") || "(none yet — do not use site:)"}
- Results from other sites are fine; return them with in_pool=false. The worker registers their domains for a person to judge and uses the sources.
${SEARCH_EXCLUDE_EN}

## Report — output only the requested JSON. sources: up to 10, at most 3 from one publisher, each with url (exact), title, publisher, published (YYYY-MM-DD or null), summary (two English sentences), roles, why (one line), in_pool. queries: every query you used.`;
}

export const REINFORCE_SEARCH_SCHEMA_EN = {
  type: "object",
  additionalProperties: false,
  required: ["queries", "sources", "notes"],
  properties: {
    queries: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "object", additionalProperties: false, required: ["url", "title", "publisher", "published", "summary", "roles", "why", "in_pool"], properties: {
      url: { type: "string" }, title: { type: "string" }, publisher: { type: "string" }, published: { type: ["string", "null"] }, summary: { type: "string" },
      roles: { type: "array", items: { type: "string", enum: ROLES_EN } }, why: { type: "string" }, in_pool: { type: "boolean" } } } },
    notes: { type: "string", description: "Roles not filled and why" },
  },
} as const;

/**
 * 기획·보강 판정 (군집화 v2 의 후보 하나 모드) — 글로벌판은 스윕·군집화가 없어 seed·reinforce 만 받는다.
 * 기준에 "영어로, 한국 밖 청취자에게 성립하는가"를 더한다 — 한국어 말장난에 기대거나 한국을 낯선 것으로 놓는 축은 대본 규칙(guidelines full-en)에서도 무너진다
 */
export function buildTopicJudgePromptEn(i: ClusterV2Input): string {
  if (!i.seed && !i.reinforce) throw new Error("글로벌판 판정은 주제 기획(seed) 또는 보강(reinforce) 후보 하나만 받는다");
  const mid = i.seed?.midTopic ?? i.reinforceMidTopic ?? i.midTopics[0];
  const history = historyTopic(mid);
  const cur = new Set(i.reinforce?.currentM ?? []);
  // 도메인 계층은 판정자에게 보이지 않는다(한국판 군집화 v2 와 같음, 2026-10-17) — 뼈대가 1군인지는 게이트 1이 검사한다(명세 6.3)
  const list = i.sources.map((x) => `[M${x.n}] ${x.publisher || x.domain} · ${x.published ?? "date unknown"}${x.used ? " · (already used)" : ""}${cur.has(`M${x.n}`) ? " · (current candidate source)" : ""}\n   ${x.title}\n   ${(x.summary ?? "").replace(/\s+/g, " ").slice(0, 240)}`).join("\n");
  const id = i.seed?.id ?? i.reinforce!.id;
  const mode = i.seed
    ? `## 0. Mode — one candidate from a person's topic
- Topic (from a person): "${i.seed.topic}"${i.seed.hint ? `\n- Note: ${i.seed.hint}` : ""}
- Topic area: ${i.seed.midTopic} (fixed)
- The sources below came from a web search on this topic, plus a few recent pool sources. Set the axis that best carries the topic, in one of the forms below, and build its role table. Leave out sources that do not fit the topic.
- candidates has exactly 1 item, id "${id}". You may polish the title but not change the topic. If the criteria are not met, give verdict "needs reinforcement" and list the empty roles in gaps; do not force it. If it overlaps an existing candidate, name it in dedup_note (still return the candidate; a person decides).`
    : `## 0. Mode — re-judge one existing candidate
- Candidate: "${i.reinforce!.title}" · axis (${axisTypeEn(i.reinforce!.axis_type)}): ${i.reinforce!.axis}
- Empty roles: ${i.reinforce!.gaps.length ? i.reinforce!.gaps.map(roleEn).join(", ") : "(none — this round adds publishers; if a new source gives an anchor from another publisher, swap out one source of the dominant publisher)"}
- The list mixes the current candidate sources (marked) and new search results. Add a new source only if it fits the axis and fills an empty role.
- candidates has exactly 1 item, id "${id}". Keep the title and axis (wording may be polished); do not set a new axis. Apply rules 2 to 6 below. Put roles still empty in gaps.`;
  return `You judge episode topics for "ear", an audio service that makes two-person English episodes about Korean culture. Listeners are English speakers new to Korea, many with English as a second language; do not assume a country. You see source metadata only; there are no tools and no page access. ear introduces Korean culture to newcomers. Set the axis first, then fill its roles with sources.

${mode}

## 1. Spec (spec/03 excerpt)
${i.specBacklogExcerpt.trim()}

## 2. Rules
1. **The axis.** One sentence in one of four forms: question (the one plain question a newcomer asks about the practice: "Why do people in Korea …?"; when the topic asks how, ask why people do it that way), contrast ("A, yet B"), paradox ("trying A leads to B"), redefinition ("A is really B"). Prefer the question form. Use contrast, paradox, or redefinition only when the sources show a real tension inside Korea. Not an axis: "what is X", "everything about X", or one news event. A comeback, release, or award is not an axis; use it only as a case that opens an industry axis.
   A list topic ("10 Korean words in K-dramas") keeps its list shape. The axis is what the items show together; the episode may walk through the items or groups of them. Set the count to the items the sources support and put that count in the title. List the counted items in landing. Do not replace the list with an abstract idea.${history ? `
   History mode: use axis_type "event" only for a past event in Korean History & Society; modern society topics use the other forms. An event axis asks how to read the event, not who was right. The anchor describes the event itself; an essay that uses the event as an example of another idea is not an anchor. Records from the time are cases. Counterpoint is optional.` : ` Do not use axis_type "event".`}
2. **It works in English for this listener.** Keep the question or tension inside the subject: the Korean practice itself, how it works, and why people do it. Do not build it on what outsiders, foreigners, or the West expect. Compare Korea with another country only if a listed source makes that comparison. The axis can be said in plain English with at most one Korean word. It does not rest on Korean wordplay or a pun that does not translate. It does not frame Korea as strange, rank cultures, or argue which country owns a custom.
3. **Excluded.** No axis built around one person. Nothing about a real person's private life, relationships, rumors, controversies, incidents, or lawsuits. No current political issue and no inter-Korean military issue. No promotion of an agency, brand, or product.
4. **Roles.** anchor (1 to 2 sources that answer the axis) · case · practice · context · counterpoint (optional) · numbers (optional). One source may have two roles. A source with no role is left out. 5 to 7 sources.
5. **Diversity.** At least 3 publishers (one organization is one publisher) · no publisher over half · at least 3 roles (anchor, case, and one more) · at most 1 "already used" source. The worker recounts; do not force sources in to meet it.
6. **Verdict.** "holds" if every criterion is met. "needs reinforcement" if the axis is good but required roles (anchor, case, practice, context) are empty; list them in gaps. Never list counterpoint or numbers in gaps. A domain not yet judged is not a reason for "needs reinforcement"; a person judges domains at gate 1. Mention it in dedup_note instead.

## 3. Fields (candidates[])
- title (English, plain, no clickbait) · mid_topic ("${mid}") · axis_type · axis (one English sentence) · axis_note (two lines: what question the axis leaves open, and why a newcomer would want it answered) · verdict · gaps
- sub_topic: ${i.subTopicOptions?.length ? `one of ${i.subTopicOptions.map((t) => `"${t}"`).join(", ")} only when listeners of that topic would accept the axis as theirs; otherwise null` : "null"}
- sources[]: { m: "M12", roles: ["anchor"], why: "one line" } — only M-IDs from the list
- target_fit (one line: why it works for this listener in English) · landing (one line: where the axis will be proven) · dedup_note (one line: why it does not repeat an existing candidate)

Existing candidate titles: ${i.existingTitles.length ? i.existingTitles.join(" / ") : "(none)"}

## 4. Source metadata (${i.sources.length})
${list}

## 5. Check before output
- The axis has one of the forms and passes rules 2 and 3.
- Count publishers, the largest share, and roles yourself. There is at least one anchor. Every M-ID is in the list.

## 6. Report — output only the requested JSON.`;
}

export const CLUSTER_SCHEMA_V2_EN = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "mid_topic", "sub_topic", "title", "axis_type", "axis", "axis_note", "verdict", "gaps", "sources", "target_fit", "landing", "dedup_note"],
        properties: {
          id: { type: "string" }, mid_topic: { type: "string" }, sub_topic: { type: ["string", "null"], description: "A second topic area from the list, or null" }, title: { type: "string" },
          axis_type: { type: "string", enum: Object.keys(AXIS_EN_TO_KO) }, axis: { type: "string" }, axis_note: { type: "string" },
          verdict: { type: "string", enum: ["holds", "needs reinforcement"] },
          gaps: { type: "array", items: { type: "string", enum: REQUIRED_ROLES_EN } },
          sources: { type: "array", minItems: 3, items: { type: "object", additionalProperties: false, required: ["m", "roles", "why"], properties: { m: { type: "string" }, roles: { type: "array", minItems: 1, items: { type: "string", enum: ROLES_EN } }, why: { type: "string" } } } },
          target_fit: { type: "string" }, landing: { type: "string" }, dedup_note: { type: "string" },
        },
      },
    },
  },
} as const;

/** 영어 판정 결과 → 내부 값(한국판과 같은 코드: 성립·보강 필요·근거 앵커·대립 …). 축·제목·이유 문장은 영어 그대로 둔다 */
export function judgeToInternal<T extends { candidates?: { axis_type: string; verdict: string; gaps: string[]; sources: { roles: string[] }[] }[] }>(o: T): T {
  return {
    ...o,
    candidates: o.candidates?.map((c) => ({
      ...c,
      axis_type: (AXIS_EN_TO_KO as Record<string, string>)[c.axis_type] ?? c.axis_type,
      verdict: c.verdict === "holds" ? "성립" : c.verdict === "needs reinforcement" ? "보강 필요" : c.verdict,
      gaps: c.gaps.map(roleKo),
      sources: c.sources.map((x) => ({ ...x, roles: x.roles.map(roleKo) })),
    })),
  };
}
