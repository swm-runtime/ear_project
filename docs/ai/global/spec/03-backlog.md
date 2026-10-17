# spec/03 (global) — Topic planning, backlog, gate 1

> English spec chapter for the global pipeline (`PIPELINE_LOCALE=en`). Models read parts of this file. The index and decisions live in `docs/ai/global/PIPELINE.md` (Korean, team document). If the two differ, PIPELINE.md wins and this file is fixed.

## 1. Role of this stage

The global pipeline does not sweep or cluster a source pool. A person enters a topic; the planner searches the web, judges the sources, and returns one candidate. A person approves it at gate 1. Approval is the only way into the script stage.

## 2. Topics

Eight topics, one level: Korean Language · K-Food · K-Pop · K-Drama & Film · Korean Culture · K-Beauty & Fashion · Korean History & Society · Travel in Korea. A candidate has one main topic and at most one sub-topic. Add the sub-topic only when listeners of that topic would accept the axis as theirs.

Excluded topics (never planned): private life, relationships, controversies, incidents, or lawsuits of real celebrities or public figures · current political issues and inter-Korean military issues · promotional topics for a specific agency or brand. A real person appears only through verifiable public facts, and no episode is built around one person.

## 3. Candidate structure

| Field | Content | Rule |
|---|---|---|
| `id` | Candidate ID | |
| `mid_topic` | Main topic | One of the eight topics |
| `sub_topic` | Second topic | Optional |
| `title` | Working title | No clickbait |
| `summary` | One line | Why these sources make one story |
| `axis` · `axis_type` | The axis | contrast ("A, yet B"), paradox ("trying A leads to B"), redefinition ("A is really B"). An event axis is allowed only in Korean History & Society |
| `sources` | Source set | At least three, with url, title, publisher, published date, roles, and one backbone source |
| `gaps` | Empty roles | Roles no source fills |
| `dedup_note` | Overlap check | State plainly when the check could not be done |

Source roles: anchor (the evidence the axis rests on) · case · counterpoint or limit · numbers or survey · history or context. The backbone source is an anchor from an allow-open (tier 1) domain.

Content limits by topic:
- K-Food, Travel in Korea: no prices, store names, opening hours, transport, fares, or booking details.
- K-Pop: industry and phenomena, not individuals. No lyrics.
- K-Drama & Film: no plot-summary episodes. No lines read aloud.
- K-Beauty & Fashion: no product or brand recommendations. Effects only from research.
- Korean History & Society: an event axis is allowed. Statistics name the year they describe.

## 4. Status

`proposed` → (gate 1) `approved` → `claimed` → `drafted` → `qa_passed` → `packaged` → `published`. Failures go to `review_required` or back to `proposed`. `rejected` keeps the row.

## 5. Splitting

An episode is at least 5 minutes. There is no target length. Propose a split only when the material is 20 minutes or more. A person decides the split.

## 6. Gate 1

- The decision is about the topic and its sources together: are these sources worth an episode?
- Approval opens only when all four hold: every source domain is judged (no candidate or unknown domain) · the backbone is from a tier-1 domain · the excluded-topic screen passed · any empty-role or overlap warning was confirmed by a person.
- The global instance never auto-approves.

## 7. Done when

- Given a planned topic, When the planner returns, Then the candidate has an axis, at least three sources with roles, and a screen record.
- Given a candidate, When a person approves it, Then all four gate conditions held at that moment.
