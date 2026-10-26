# spec/04 (global) — Script

> English spec chapter for the global pipeline (`PIPELINE_LOCALE=en`). The writing rules themselves are the guidelines asset (`skills/draft/guidelines.gpt.md`, DB is the source of truth). This chapter fixes the format that code checks. Index and decisions: `docs/ai/global/PIPELINE.md` 6.4.

## 1. Role of this stage

Turn an approved candidate into a two-person English dialogue script that QA can verify against the sources and TTS can voice.

## 2. Procedure (two stages)

1. **Plan** (one call, no tools): code fetches the sources and numbers their paragraphs. The planner selects excerpt IDs, writes the claims table and the outline, and registers pronunciations. The worker writes `sources.md`, `claims.md`, `outline.md`, `pronunciations.json`. An axis check (one cheap call) confirms each section answers the axis.
2. **Write** (one call, no tools, no sources): the writer sees only the excerpts, claims, outline, and pronunciation map, and returns the script in a JSON report.
3. **L0** (code) checks the format; violations go back to a fix call (at most 3). Then QA.

## 3. Roles

| | Explainer (E turns) | Host (Y turns) |
|---|---|---|
| Who | Grew up in Korea; frames meaning and context | A curious non-Korean; the listener's stand-in |
| Does | Every factual statement | Questions, guesses, reactions |
| Fixed | Explains in every episode | Hosts in every episode |

Speaker names come from the episode's team, chosen by the representative topic (PIPELINE.md 6.7 cast table): Yuna (explainer) and Owen (host), or E-um (explainer) and Grace (host). The prompt gives the two names; E turns use the explainer's name and Y turns the host's.

## 4. Structure and length

```
{meta line}
## [Intro]      host's intro template (Y1)
## [Opening]    two or three turns that raise the newcomer's question
## [Body]       ### #1 Title … ### #n Title (the outline's sections)
## [Closing]    host's closing lead → explainer wrap-up → host's sign-off (last turn)
```

### Line format (parser contract)

| Element | Format | Example |
|---|---|---|
| Zone header | `## [Zone]` — the four zones above, once each, in order | `## [Body]` |
| Section header | `### #n Title` — the outline's numbers and order | `### #2 Why families trade labor` |
| Turn | `[Name] {E\|Y}{n} · text` — label, number, middle dot | `[Mina] E1 · Kimjang is…` |

- E and Y are numbered separately from 1.
- The meta line is `Episode ID · Title · Topic · explainer/host · prompt version · sources used`.
- No source list, no AI disclosure, no URLs, tables, or markdown in lines.

### Templates (settings `templates`, tpl-en-v4)

```
[Intro — host, Y1, one turn]
Hi, and annyeonghaseyo! Welcome to Earcast, your K-podcast. {topic_line} Today we're talking about {episode_line}.

[Closing lead — host]
We've been talking about {episode_recap}. {host_remark}
(the explainer's wrap-up turn follows)

[Sign-off — host, the last turn, fixed text; variants rotate per episode]
That's all for this episode of Earcast. Thanks for listening, and gamsahamnida!
Thanks for spending this time with us on Earcast. Gamsahamnida!
That's our story for this episode. See you next time on Earcast. Gamsahamnida!
```

- `{topic_line}` is the topic's fixed line (`templates.major_lines`). `{episode_line}` is this episode's axis in one line, in the intro.
- `{episode_recap}` is the same topic in one line, in different words from `{episode_line}`. It names the topic, not the answer; the wrap-up gives the answer.
- `{host_remark}` is one question in the host's own words that asks the explainer to bring the episode together around the axis question. It is not a feeling or a reaction, and it does not repeat the intro. The explainer's wrap-up answers it.
- The sign-off has no slot. It is said word for word. A series episode (spec/11) puts its series sentence (next-episode preview or finale) right before the sign-off line, in the same host turn.
- tpl-en-v4 (2026-10-18, 박수헌): the closing lead was "We've been talking about {episode_line}. {host_remark}" — the same slot repeated the intro line word for word, and {host_remark} had no definition, so the host gave a reaction twice (G261018-001~003). The frame stays; the slot is now {episode_recap}. The sign-off's {host_line} (the host's reaction) was dropped: after the host's closing question and the explainer's answer, the sign-off only says goodbye.
- The intro greeting (`annyeonghaseyo`) and the sign-off thanks (`gamsahamnida`) are written in romanization. The global pronunciation dictionary maps them to Hangul, so the voice says them in Korean (tpl-en-v2 and v3, 2026-10-16).
- L0 checks that the last turn is a host turn containing a sign-off head (the text before its first `{`).

### Length

- Floor 5 minutes, no target length, no upper limit. Length comes from the material. Propose a split only when the material is 20 minutes or more.
- Rate: 146 words per minute (spoken words in turns), fixed on 2026-10-17 from the first three synthesized episodes (145.3, 148.3, 146.3). L0 floor: 730 words. Writing target: the outline's estimated minutes × 146, within 10 percent.

## 5. Notation

| Item | Script (reading form) | TTS input |
|---|---|---|
| Korean names and words | Romanized (official English spelling for names and works; public-terms guideline for places and heritage; Revised Romanization otherwise), meaning explained on first use | Replaced by the pronunciation map |
| Numbers, years, money | Digits; Korean won as `KRW 15,000`, no dollar conversion | `KRW` → "won"; numbers read by ElevenLabs |
| Dokdo, East Sea | Korean names | — |

## 6. Pronunciation map

- The planner registers every Korean word and name the script will use in `pronunciations.json`, with the word in Hangul as the reading (the voice reads Hangul in Korean), or an empty reading when it cannot give one. Lines keep the romanized spelling; only the TTS input gets the Hangul. Names that listeners abroad already say in English (a place, company, group, or work with an established English name, or a person known abroad by an English form) are not registered, so the voice reads them in English. Other names, including people's names, are registered in Hangul. The writer and the fix call add new ones the same way.
- The global dictionary (asset `skills/tts/pronunciation.json`) and the episode map are merged; the global entry wins; matching ignores case.
- TTS stops if any registered word has no reading in either. A person fills it in the episode's pronunciation tab.

## 7. Claims table

`claims.md` columns: ID · claim (English) · excerpt IDs · type (number, quote, name, cause, definition, practice) · section · notable · opinion · attribution (worker-derived) · excerpt language (`ko` when the excerpt is Korean). Every factual statement in the script maps to a claim.

## 8. Outputs

`episodes/{id}/`: `sources.md` · `claims.md` · `outline.md` · `pronunciations.json` · `script.md` · `script-notes.md`. Excerpts are internal records and are not redistributed.

## 9. Done when

- Given an approved candidate, When the draft stage ends, Then the six outputs exist and the script passes L0 or is sent to fixes.
- Given a script, When it is parsed, Then every turn has a speaker, a number, and a zone, and the last turn is the host's sign-off.
