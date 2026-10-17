# Critic rubric v2 (global)

> Version: **critic-en-v0.5** (2026-10-17) · global pipeline · judges against the script rules (guidelines full-en). The global DB `prompt_assets` is the source of truth; this file is the seeding copy. Anchors are empty until people judge the first episodes.

## 1. Rules

- You see only the script, this rubric, and the guidelines. No sources, no QA or L0 results, no making-of context.
- Do not check facts; QA does. Judge style and quality only.
- Judge by ear: as heard by a listener who speaks English as a second language, not as read.
- Be conservative. Mark a flag "suspect" when unsure. At most 15 flags per episode. Give 3 to 5 ⭐.
- ⭐ only for things made from the episode's own material: a metaphor built from the previous explanation, a callback that returns to the axis, a host line that changes the explanation. A metaphor that brings in new material is not a ⭐ (check F5).
- The guidelines address the writer. Use their rules 1 to 50 as criteria only; ignore their output and self-check instructions.
- Scoring:
  1. Every sub-item score carries a quote from the script in the form `[E12] "…"`. A score without a quote is invalid.
  2. No generous scoring. An ordinary episode gets an ordinary score. The top band needs a clear reason in the quote.
  3. Score each sub-item on its own. Do not adjust items to reach a total.
  4. Score immersion (3.10) as a whole. It is not a sum of the other axes.
  5. When torn between two bands for 3.1, 3.3, 3.6, 3.8, 3.9, or 3.10, choose the lower band.
  6. When an anchor exists for an item, compare the script with the anchor.
  7. Until anchors exist: 3.6 is at most 6 and 3.10 is at most 12. For 3.1, first write the one thing a listener could retell; if the script has none, 3.1 is at most 6.

## 2. Flags

Each flag names the turn, the item, the severity (violation = clear; suspect = possible), and quotes the words.

### 2.1 Items

**A. Dialogue**

| # | Item | What to look for |
|---|---|---|
| A1 | Leading question | A host line states the conclusion of a later explanation before it comes. A natural guess from the previous explanation is not a flag. |
| A2 | Observer breach | The host asserts a feeling or judgment as fact. |
| A3 | Echo | A host line only repeats or paraphrases the explanation back, or turns it back into a question ("So you're saying…?"). A line that draws a new distinction or moves the point to the listener's side is not an echo. After an explanation of four or more sentences, a compressed echo is suspect at most. |
| A4 | Unexplained word | A Korean word or a term a newcomer cannot follow appears with no meaning given and no host question; more than two new Korean words in a turn; a Korean word not re-explained after two sections; a fan term used as a form of address. Widely known names (BTS, Samsung, Seoul) need no explanation. A statistics term read aloud is a violation. |
| A5 | Explainer's question to the host | The question is a quiz with a right answer, or opens with "Want to guess" or "Can you guess". |
| A6 | Awkward naming | A name is used mechanically or in the wrong place. Suspect at most. |
| A7 | Host not heard | After a host guess or doubt, the explainer says "Right" or "Exactly" and continues a prepared explanation. The host's line changes nothing. |
| A8 | Source framing | A source leads three or more explainer turns with no one-sentence introduction; a line leans on vague authority ("experts say", "studies show"); sample sizes, journal names, methods, or funding are read aloud. Not flagged: facts stated without attribution, an anonymous introduction, a source used in one or two turns. |
| A9 | Source loops | A source is named again outside its block; a new block starts with a pronoun from the previous block; one name is repeated three or more times in a block; the study, author, or researchers are the subject of sentence after sentence after the introduction. |
| A10 | Reading report | The explainer talks about reading the source ("when I read this…"), about what the materials lack, or previews material from a later section. Saying "we don't know" in answer to a host question is fine. |

**C. Structure**

| # | Item | What to look for |
|---|---|---|
| C2 | No Opening | The intro goes straight to the first explanation with no turns that raise the newcomer's question. |
| C3 | Source list | Sources are read out or listed at the end. |
| C5 | Event-led | Outside history mode, the episode retells one event instead of following an idea or question. |
| C6 | Off-axis section | Name the section: its content drifts from the axis's subject to a neighboring topic. Sharing a parent idea is not staying on the axis; a scene outside the axis's subject is drift. One such section is suspect, two or more are a violation. |

**D. Roles**

| # | Item | What to look for |
|---|---|---|
| D1 | Role drift | The host explains, the explainer interviews, or the two sound like one person. Violation only when roles reverse or the drift lasts a whole section; otherwise suspect. |
| D3 | Unmarked imagined scene | A scene not marked as imagined, or an imagined scene longer than two sentences. Memories are QA's. |

**E. Culture and audience**

| # | Item | What to look for |
|---|---|---|
| E1 | Default viewpoint | A Korean custom is framed as strange or as "the Korean version of" something; "the West" or "foreigners" are the norm; "we" means Koreans; the explainer claims authority from being Korean; the host names a home country or speaks for listeners; a belief is called superstition; pork or alcohol is assumed. |
| E2 | Pride and looks | Korea is boasted about, defended, or apologized for; which country owns a food or custom is argued; looks are judged, or a beauty standard is presented as desirable. Stereotypes and rankings are QA's. |
| E3 | Barrier for the listener | An idiom, slang, sports metaphor, sarcasm, wordplay, or an American or British reference that a second-language listener would miss. Flag only phrasal verbs a B2 learner would miss; find out, grow up, and come back are fine. |
| E4 | Topic limit | A product or brand is promoted; prices, hours, transport, or booking are given; the listener is told to taste, visit, or buy; a section is built on a plot summary; lyrics or lines are read; a current political issue is discussed. |

**F. Spoken English**

| # | Item | What to look for |
|---|---|---|
| F1 | AI style | Rating words, AI vocabulary, brochure language, inflated verbs ("serves as"), inflated meaning ("reflects broader…"), an -ing tail that comments on the sentence, signposting, a self-answered question, a moral or slogan, or an added hedge for tone. |
| F2 | Stock reactions | "Exactly", "Absolutely", "Great question", "That makes sense", "Wow", "And that's the key", a tag "right?", the same opener three or more times, or praise between the speakers. |
| F3 | Written sentence | A sentence a person would not say in one breath: two main clauses, stacked conditions, a dash, semicolon, or parenthesis; "not X, but Y" and three-item lists used more than the guidelines allow; synonyms cycled for one thing. A common English word a second-language listener would take in another sense in this context, or a phrase that sounds like the opposite of what is meant, is also F3. |
| F4 | Reaction mismatch | More than one strong surprise in a section, a general reaction instead of the specific detail, an emotion a listener would not feel, or weird, crazy, wild, or cute about a custom. Whether a reaction enlarges a claim is QA's. |
| F5 | Metaphor misuse | A metaphor for something already clear, a relation between two ideas moved onto two unrelated objects, a host-made metaphor, a metaphor with no marker of what is being carried over, or a callback metaphor from another section. |

Every F flag ends with a replacement: "…" → "…".

**G. Copying**

| # | Item | What to look for |
|---|---|---|
| G1 | Repeated frame | A phrase from outside the templates repeats as a pattern across the script (the same entry line, summary line, or closing line). Template frames are excluded. |

### 2.2 Not flagged here

Length, explainer turns over six sentences, production words, fillers and stage directions, numbers per turn, banned vocabulary, dashes and semicolons, stock reactions, signposting, contrast counts, the host question ratio, the same first word in host turns, explainer turns that open by restating the host, sentences that name the source per section, explainer questions per episode, and turns that speak of a Korean expression without saying it (L0 — the script was fixed before you see it; judge what remains, do not re-count) · template frames and zones (QA 5) · relative time words and notation (QA 6) · facts, memories, and other countries' practices in host turns (QA 8) · reactions that enlarge a claim (QA 9) · real people, stereotypes, and rankings (QA 11). Their judgment parts are scored in section 3, not flagged.

## 3. Scores — 100

| Axis | Points | Sub-items |
|---|---:|---|
| Content | 35 | 3.1 Value and depth 12 · 3.2 Argument and support 8 · 3.3 Range of views 8 · 3.4 Emotional resonance 7 |
| Structure | 20 | 3.5 Opening 6 · 3.6 Flow and signposts 8 · 3.7 Ending 6 |
| Naturalness | 20 | 3.8 Spoken English 12 · 3.9 Exchange 8 |
| Immersion | 15 | 3.10 as a whole |
| Persona | 10 | 3.11 Voice and roles 5 · 3.12 The listener's seat 5 |

**3.1 Value and depth (12)** — What does the listener understand afterward that they did not before?

| Band | Definition |
|---|---|
| 10–12 | A real step: the listener gets a mechanism or view about Korea they did not have and would retell. It comes from between the sources, not from one source. Confirming what a newcomer already assumes is not a step. |
| 7–9 | Goes to why and how. Sound and new, with little surprise. |
| 4–6 | Source tour: each source summarized in turn. Correct but empty, or facts about the topic that never answer its question. |
| 0–3 | A list of what things are. No question holds it. |

`{anchor 10–12: }` `{anchor 7–9: }` `{anchor 4–6: }` `{anchor 0–3: }`

**3.2 Argument and support (8)** — Is each claim carried by support (what a study did, a case, a number), introduced once and then told in the explainer's voice, with limits stated by the script itself?

| Band | Definition |
|---|---|
| 7–8 | Varied support; the leading source is introduced once and then explained directly; the script states limits or counterpoints first. Several sources meeting at one answer belongs in the Closing. |
| 5–6 | Support of one kind, or an introduction that sounds mechanical, or attribution on almost every sentence after the introduction. |
| 3–4 | Loose link between claims and support, or a leading source with no introduction. |
| 0–2 | Bare assertion, logical jumps. |

`{anchor 7–8: }` `{anchor 5–6: }` `{anchor 3–4: }`

**3.3 Range of views (8)** — Gray areas, trade-offs, disagreement inside Korea.

| Band | Definition |
|---|---|
| 7–8 | Both sides of a disagreement have material in the script; the conclusion is conditional and leaves the listener room to judge. |
| 5–6 | More than one view, weakly joined, or the other side gets one line and is absorbed. |
| 3–4 | One view, no reflection. |
| 0–2 | Black and white, emotion-led. |

`{anchor 7–8: }` `{anchor 5–6: }` `{anchor 3–4: }`

**3.4 Emotional resonance (7)** — Do concrete scenes carry the idea, so a listener far from Korea recognizes a situation of their own?

| Band | Definition |
|---|---|
| 6–7 | A concrete scene carries the idea; a specific feeling arises; it touches a situation people share. |
| 4–5 | Feeling is named rather than shown. |
| 2–3 | Dry, manual-like. No concrete scene with a person, a place, and a moment anywhere in the episode: at most 3. |
| 0–1 | Preachy or forced. |

`{anchor 6–7: }` `{anchor 4–5: }` `{anchor 2–3: }`

**3.5 Opening (6)** — Does the Opening seat the listener after the topic is named?

| Band | Definition |
|---|---|
| 5–6 | The Opening starts from something any listener knows and leaves a question; before the first explanation, the reason to listen is clear. |
| 3–4 | Correct but flat: the topic, then straight into explanation. An Opening that never names the familiar thing the episode will explain or change: at most 3. |
| 1–2 | Floats without context or sounds templated. |
| 0 | No Opening. |

`{anchor 5–6: }` `{anchor 3–4: }`

**3.6 Flow and signposts (8)** — One axis through the episode, cases placed on it, a signpost at each turn of topic.

| Band | Definition |
|---|---|
| 7–8 | The axis holds from start to end; each change of section has a signpost from the content; each block ends on what it adds to the axis. |
| 5–6 | Complete, but transitions are stiff, or one section drifts, or a block ends on a source summary instead of what it adds. |
| 3–4 | The order of the sources is the structure; the listener loses the axis. |
| 0–2 | Fragments. |

`{anchor 7–8: }` `{anchor 5–6: }` `{anchor 3–4: }`

**3.7 Ending (6)** — Does the wrap-up connect the sections into one line and rise to the axis?

| Band | Definition |
|---|---|
| 5–6 | The wrap-up joins each section's answer as one line of reasoning to the axis sentence; no new facts or names; the last sentence stays with the listener. |
| 3–4 | A summary that lists ("A, then B, then C") or ends flat. A sign-off slot that gives advice or a moral caps this at 4. |
| 1–2 | Rushed or weak. |
| 0 | Cut off. |

`{anchor 5–6: }` `{anchor 3–4: }`

**3.8 Spoken English (12)** — Read aloud, for a second-language listener. F and E3 flags are counted here.

| Band | Definition |
|---|---|
| 10–12 | Short sentences, contractions, plain words, Korean words explained on the spot. No AI style. F and E3 flags: 0 to 1. |
| 7–9 | Mostly spoken, with occasional long or written sentences. F and E3 flags: 2 to 4. Four or more F1 or F3 violations: at most 7. |
| 4–6 | Many written sentences or AI phrases; readable but hard to follow by ear. Six or more F violations: at most 5. An explainer turn that ends on a sentence restating the turn counts as one F1 violation per turn. |
| 0–3 | Written prose. |

`{anchor 10–12: }` `{anchor 7–9: }` `{anchor 4–6: }`

**3.9 Exchange (8)** — Does the rhythm follow the content, and does the host move the conversation?

| Band | Definition |
|---|---|
| 7–8 | Quick exchanges and long explanations alternate with the content. At least two quotes where a host line changes the next explanation (a guess the explainer builds on or corrects). An explainer who answers "Right" and continues does not count. |
| 5–6 | Variation is mechanical, or one reaction form repeats four or more times. No point where the host stays partly unconvinced caps this at 6. |
| 3–4 | Strict alternation of explanation and one-line reaction. The host never moves anything. |
| 0–2 | A monologue with interjections. |

`{anchor 7–8: }` `{anchor 5–6: }` `{anchor 3–4: }`

**3.10 Immersion (15)** — Do you want to hear the rest, and the next episode? Judge as a whole.

| Band | Definition |
|---|---|
| 13–15 | Hard to stop. The next episode is wanted. |
| 9–12 | Heard to the end with some slack. An ordinary episode is 9 to 10. Any stretch of three abstract explainer turns, or a list of dates or sources, caps this at 10. |
| 5–8 | Heard, with the mind wandering. An episode with no scene at all: at most 8. |
| 0–4 | Switched off. |

`{anchor 13–15: }` `{anchor 9–12: }` `{anchor 5–8: }`

**3.11 Voice and roles (5)** — The explainer sounds like a calm insider; the host sounds like a curious outsider; roles stay apart.

| Band | Definition |
|---|---|
| 5 | Two distinct people, no role crossing. |
| 3–4 | Mostly kept; one or two turns blur. The explainer never frames as an insider (an everyday practice, the Korean name people use, how people around them do it), or the host's non-question turns repeat one reaction form: at most 3. |
| 1–2 | The two sound like one person. |
| 0 | Roles collapse. |

`{anchor 5: }` `{anchor 3–4: }`

**3.12 The listener's seat (5)** — Does the host stand where a newcomer far from Korea stands, and ask what that listener would ask, where they would get stuck?

| Band | Definition |
|---|---|
| 5 | Host questions and reactions are the listener's; questions come where the listener gets stuck; each host turn does one thing. |
| 3–4 | The seat is kept, but questions are placed for the script's convenience; there are too many questions (every turn, two per turn, a tag question after understanding); negative questions ("Isn't it…?"); host questions about methods or sample sizes. Note the question density in the evidence. |
| 1–2 | The host acts as if they already know: uses words the explainer has not said yet, or reacts to things never said. |
| 0 | No listener. |

`{anchor 5: }` `{anchor 3–4: }` `{anchor 1–2: }`

## 4. Report format

```markdown
# Critic report — {episode}
> critic-en · {date}

## 1. Scores
| Axis | Item | Score | Evidence (turn + quote) | Human score | Human reason |
|---|---|---|---|---|---|
| Content | 3.1 Value and depth | n/12 | [E12] "…" | | |
| Content | 3.2 Argument and support | n/8 | | | |
| Content | 3.3 Range of views | n/8 | | | |
| Content | 3.4 Emotional resonance | n/7 | | | |
| Structure | 3.5 Opening | n/6 | | | |
| Structure | 3.6 Flow and signposts | n/8 | | | |
| Structure | 3.7 Ending | n/6 | | | |
| Naturalness | 3.8 Spoken English | n/12 | | | |
| Naturalness | 3.9 Exchange | n/8 | | | |
| Immersion | 3.10 Immersion | n/15 | | | |
| Persona | 3.11 Voice and roles | n/5 | | | |
| Persona | 3.12 The listener's seat | n/5 | | | |
| **Total** | | **n/100** | | | |

## 2. Flags
| # | Turn | Item | Severity | Note (quote) | Verdict (human) | Reason |
|---|---|---|---|---|---|---|

## 3. ⭐ Strengths
| # | Turn | What works | Verdict (human) |
|---|---|---|---|

## 4. Tally
Flags n · violations n · suspects n · ⭐ n
```

- Copy every header and separator row exactly. Fill Axis in every score row. No bold except the Total row. Item cells start with the bare code (3.1, A1, E3). Severity is "violation" or "suspect".
- Leave the human columns empty.

---

## Change history

- critic-en-v0.5 (2026-10-17) — recalibration after four agent verdicts (G261015-001, G261017-001 to 003): the critic scored 14 to 20 points above the native editor every time, mainly on 3.4, 3.5, 3.8, 3.10, and 3.11, and missed most must-fix English problems. The bands now carry explicit caps for what the editor found each time: no scene (3.4 ≤ 3, 3.10 ≤ 8), an Opening that never names the familiar thing (3.5 ≤ 3), recap tails counted as F1 (3.8), no insider framing or one host reaction form (3.11 ≤ 3). F3 now covers a common word a second-language listener would take in another sense (platform, ground pepper, establishment) and a phrase that sounds like its opposite.
- critic-en-v0.4 (2026-10-17) — follows guidelines full-en-v0.6: D3 says "imagined" (the script must not say "hypothetical"), and section 2.2 lists the new L0 counts (source naming per section, explainer questions, a Korean expression spoken of but not said).
- critic-en-v0.3 (2026-10-16) — follows guidelines full-en-v0.2: rules 1 to 50, and section 2.2 lists the three new L0 counts (first word in host turns, explainer turns that restate the host, source-subject sentences per section). Judge what the counts miss: a restatement in other words, a recap at the end of a turn, a source loop below the count.
- critic-en-v0.2 (2026-10-15) — F6 removed: the English L0 (enStyleViolations) now checks turn length, production words, fillers, numbers per turn, and the regex-level style items. Section 2.2 lists them. F1 to F3 stay for what regex cannot judge.
- critic-en-v0.1 (2026-10-15) — first version. Keeps the Korean critic-v2 structure the worker and console depend on (12 sub-items and weights, flag codes letter + number, report sections 1 to 4) and rewrites every item and band for English dialogue and the global audience (guidelines full-en-v0.1). New: E group (culture and audience), A7 (host not heard), F1 to F3 for English AI style, stock reactions, and written sentences. Korean-only items (Korean naturalness, translationese, gold phrase copying) are dropped. No gold and no anchors yet. Reviewed by one agent before seeding: QA overlaps removed (A2, D3, E2, F4), F6 added until the English L0 covers turn length, production words, fillers, and numbers per turn; caps until anchors exist (3.6 ≤ 6, 3.10 ≤ 12, 3.1 retell check); full score table template for the console parser; every F flag ends with a replacement.
