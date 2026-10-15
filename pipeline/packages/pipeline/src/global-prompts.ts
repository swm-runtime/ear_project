/**
 * 글로벌판(PIPELINE_LOCALE=en) 대본 프롬프트 — 설계·대본·수정·축 심사 (KAN-201 영어 규칙 · 글로벌 명세 4.5·6.4).
 * 한국판 빌더를 번역하지 않고 새로 썼다: 동작(입력·출력 계약·워커가 검사하는 표기)만 같고 지시문은 영어 규칙(guidelines en-v0.x)을 따른다.
 * 모델이 읽는 글이라 영어다. 워커는 호출 지점에서 로케일로 고른다 — 한국판 빌더는 손대지 않는다.
 * 런타임 import 는 locale.js 만 한다(index.ts 와의 순환을 피한다 — index 는 이 파일을 다시 내보낸다).
 *
 * 워커가 대조하는 표기(바꾸면 워커도 같이 바꾼다):
 * - 구성안: `Axis:` · `Section #n — 제목` · `  Question:` · `Estimated length: N min` (locale.ts outlineMarks · design-single.ts)
 * - 대본: `## [Intro]` 4구역 · `### #n 제목` · `[이름] E1 · 문장` (locale.ts scriptZones · draft-two-stage.ts twoStageViolationsEn)
 * - 발음 맵: 대본의 한국어 단어 전부, 힌트 없으면 빈 문자열 (글로벌 명세 6.7 — TTS 발음 누락 검사)
 */
import { otherSpeaker, scriptZones, speakerNames } from "./locale.js";
import type { BacklogCandidate, DesignInlineInput, IntroStyle, PromptParts, RevisionInlineInput, Templates, WriteInput } from "./index.js";

const fence = (s: string) => "````\n" + s.trim() + "\n````";
const explainerEn = () => speakerNames()[0];

/** 글로벌판 역사 모드 — 주제 Korean History & Society 의 사건형 축 후보만 (글로벌 명세 6.3: 역사 주제는 사건형 축 허용). 같은 주제의 현대 사회 편은 개념 축이다 */
export const HISTORY_TOPIC_EN = "Korean History & Society";
export const isHistoryCandidateEn = (c: Pick<BacklogCandidate, "mid_topic" | "axis_type">): boolean =>
  c.mid_topic === HISTORY_TOPIC_EN && (c.axis_type === "사건" || c.axis_type === "event");

/** 도입 방식 4종 — 인트로 템플릿 뒤 [Opening] 첫 턴을 어떻게 여는가. 기능만 적는다(문장을 적으면 대본에 복제된다, 한국판 v9.4 교훈).
 *  글로벌판 인트로는 질문 없이 주제 선언으로 끝난다(tpl-en-v1, 박수헌 2026-10-15) — 한국판처럼 "인트로 질문을 받는" 형태가 아니다 */
export const INTRO_STYLES_EN: readonly IntroStyle[] = [
  { key: "experience", label: "everyday scene", hint: "The explainer opens the Opening with one ordinary situation anyone could meet, stated as hypothetical. Two or three short turns stay in that scene before the first explanation. Do not start it with the same words each time." },
  { key: "object", label: "one object", hint: "The explainer opens the Opening with one concrete object and what it looks like. Two or three turns stay with it, and it becomes the first case of the topic." },
  { key: "question", label: "question back", hint: "The host opens the Opening with the first question a newcomer would ask about the topic, built from the topic name alone and holding no fact. The explainer asks back one short thing about why it matters to the host, and the host's answer, a guess or feeling, opens the first explanation." },
  { key: "thesis", label: "surprising claim", hint: "The explainer opens the Opening with one claimed fact that runs against what a newcomer would expect. The host reacts or doubts for two or three turns. Start with the fact itself, not an announcement." },
];

const variants = (t: Templates | null | undefined) => (t?.closing_signoff ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

/** 템플릿 블록 — 슬롯 이름은 영어 템플릿의 계약: {topic_line}(주제별 고정 한 줄, major_lines) · {episode_line}(이 편의 축 한 줄). 그 밖의 {slot} 은 이 편의 내용으로 채운다 */
function templateBlockEn(t: Templates | null | undefined, topic: string | undefined, seed: number): string {
  if (!t) return "- Templates are not set. Write a plain one-turn intro by the host and a plain one-turn sign-off by the host.";
  const line = (topic && t.major_lines?.[topic]) || "";
  const v = variants(t);
  const signoff = v.length ? v[Math.abs(seed) % v.length] : null;
  return `- **Intro template** (Y1, one turn by the host; keep the frame, fill only the {slots}, no braces may remain; the turn ends with the template — no question after it):
${fence(t.intro)}
  - {topic_line} = ${line ? `"${line}" (fixed text, use it word for word)` : `one plain sentence that introduces the topic "${topic ?? "-"}" to anyone`}
  - {episode_line} = this episode's axis in one line a listener catches by ear, not the title repeated
- **Closing lead template** (the host; keep the frame):
${fence(t.closing)}
  - After it, one explainer wrap-up turn (guidelines, Closing rule).${signoff ? `
- **Sign-off template** (the last turn of the script, by the host; keep the frame, fill only the {slots}):
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
  const roles = c.sources.map((s, n) => `S${n + 1} ${s.publisher}: ${(s.roles ?? []).join(", ") || "no role"}`).join(" / ");
  return `- **Backlog axis (starting point)**: [${c.axis_type}] ${c.axis}
- Backlog roles: ${roles}${c.gaps?.length ? `
- Empty roles: ${c.gaps.join(", ")} — fill them from the text if you can; otherwise write "none" in the outline's role table` : ""}
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
- Each claim: id (C01…) · text (one English sentence) · excerpt_ids · type (number, quote, name, cause, definition, practice) · section (the Body section that uses it; all claims from one source share one section, except the axis_source, which may use two) · notable (true only for people or institutions a general listener knows by name) · opinion (true for a person's opinion, interpretation, or forecast, or a contested or interested claim).
- A claim is never more specific than its excerpt. Keep the excerpt's hedges and the subject it attributes to. For a Korean excerpt, translate the meaning exactly; do not add or soften.
- A real person appears only through verifiable public facts. Do not make a claim from rumor, private life, or controversy.
- Links between sources are not claims; put them in the outline's links list.

### c) outline_md — the contract for the script stage. Use exactly this format:
\`\`\`
# Outline — {episode ID}

Axis: [contrast|paradox|redefinition${history ? "|event" : ""}] one sentence
Axis note: why this axis creates tension for the listener, two lines
Landing section: #n — where the axis is proven
Estimated length: n min

Roles
- Axis source: S? (the one source that may appear in two sections, or "none")
- Section order: one line on why #1 to #n are steps toward the axis
- Cases: S?
- Counterpoints and limits: S?
- Numbers and surveys: S?
- History and context: S? (or "none")
Unused sources: S? — reason

Section #1 — Title
  Purpose: what the listener keeps, one line
  Question: the sub-question of the axis this section answers
  Material: C01, C03 (S1) · C07 (S3)
  Host question: one question built only from earlier sections, or "the explainer opens"
  Transition: one device, different from the previous section
  Ratio: n%
Section #2 — …

Links and metaphors (made by the script, not facts)
- "X carried over to Y" — based on C##, in section #n

Closing line: what the listener understands at the end
\`\`\`
Planning rules:
- The axis is a contrast ("A, yet B"), a paradox ("trying A leads to B"), or a redefinition ("A is really B")${history ? ", or, in history mode, an event" : ""}. "What is X" is not an axis.
- Sections are steps of the axis, not the order of a source. Each source goes to one section only, except the axis_source. Drop a source that answers no sub-question of the axis.
- Four to six Body sections. The Opening is not a section.
- The Host question uses only what came before; it never contains the section's new case, number, or result. Never ask about methods, samples, or limits.
- Estimated length comes from the material: 13 minutes is the floor, 15 minutes the average. Do not inflate it. If the material cannot reach 13 minutes, do not build an outline; say why in notes. If it is 26 minutes or more, put a split plan in split_proposal and still build one outline.
- Every C## in the outline exists in claims.
- Topic limits (guidelines rule 7) apply to the plan: no section built on prices, opening hours, transport, product recommendations, or plot summary.

### d) pronunciations
- Every Korean word and Korean name the script will use, as romanized in the claims. reading = an English respelling a TTS voice reads correctly, in plain letters and hyphens. Leave reading empty when you cannot give one; a person fills it before audio.
- Do not list English words or a romanized word that is also a common English word.

## 3. Report — output only the requested JSON. No text before it.`;
  const user = `${history ? historyDesignEn + "\n\n" : ""}## Episode (backlog ${i.candidate.id}, gate 1 approved)
- Episode ID: ${i.episodeId} · working title: "${i.candidate.title}" · topic: ${i.candidate.mid_topic}
- The first line of outline_md is exactly "# Outline — ${i.episodeId}".
- Explainer: **${explainer}** / host: **${host}** — fixed roles.
- Listener: a general listener new to this topic, often with English as a second language. About 15 minutes.
${candidateAxisBlockEn(i.candidate)}

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
    axis_type: { type: "string", enum: ["contrast", "paradox", "redefinition", "event"] },
    landing_section: { type: "integer" },
    axis_source: { type: "string", description: "The one source that may span two sections, as \"S3\" only (no URL or title). Empty string if none" },
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "title", "sources", "ratio"], properties: { n: { type: "integer" }, title: { type: "string" }, sources: strArr, ratio: { type: "integer" } } } },
    excerpt_ids: { ...strArr, description: "Selected paragraph IDs (S1-03 …)" },
    gists: { type: "array", items: { type: "object", additionalProperties: false, required: ["s", "lines"], properties: { s: { type: "integer" }, lines: strArr } }, description: "Three English lines per source" },
    claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "text", "excerpt_ids", "type", "section", "notable", "opinion"], properties: { id: { type: "string" }, text: { type: "string", description: "One English sentence, no more specific than the excerpt" }, excerpt_ids: strArr, type: { type: "string", enum: ["number", "quote", "name", "cause", "definition", "practice"] }, section: { type: "integer", description: "Body section that uses this claim. All claims of one source share one section, except axis_source" }, notable: { type: "boolean", description: "True only if a general listener knows the person or institution by name" }, opinion: { type: "boolean", description: "A person's opinion, interpretation, or forecast, or a contested or interested claim" } } } },
    outline_md: { type: "string", description: "The full outline.md" },
    pronunciations: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string", description: "Korean word or name, romanized as in the script" }, reading: { type: "string", description: "English respelling in plain letters and hyphens, or empty if unknown" } } } },
    estimated_minutes: { type: "number" },
    split_proposal: { type: "string", description: "Split plan when 26 minutes or more, else empty" },
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
- The axis is the one question a listener holds for 15 minutes. Each section's question moves one step toward it.
- A section that drifts to a neighboring topic is false, even if it shares a broader idea.
- A case or counterpoint section is true only if it stays inside the axis's subject. Check the section's material too: a case from a different setting that only shows the same principle is false.
- The landing section's question is the axis question itself.
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
${templateBlockEn(i.templates, i.majorTopic ?? i.candidate.mid_topic, i.signoffSeed ?? 0)}
- Opening style: **${i.introStyle.label}** — ${i.introStyle.hint}${isHistoryCandidateEn(i.candidate) ? "\n" + historyWriteEn : ""}
- **Length target: about ${minutes} minutes = about ${Math.round(minutes * 150)} spoken words (within 10 percent).** The floor is 1,950 words. The outline's estimate already reflects the material; writing longer means the explanation got wordy.

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
    terms: { type: "array", description: "Every Korean word and specialist term, with its first turn and how it is explained", items: { type: "object", additionalProperties: false, required: ["term", "turn", "explained_by"], properties: { term: { type: "string" }, turn: { type: "string", description: "First turn id (E7)" }, explained_by: { type: "string", description: "The explaining sentence, or the host turn id that asks (Y8)" } } } },
    pronunciations_added: { type: "array", description: "Korean words or names in the script that are not in the pronunciation map", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string" }, reading: { type: "string", description: "English respelling, or empty if unknown" } } } },
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
    pronunciations_added: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string" }, reading: { type: "string", description: "English respelling, or empty if unknown" } } } },
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
