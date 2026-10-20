# Script Writing Guidelines

> Version: **full-en-v0.17** (2026-10-20) · GPT profile · global pipeline. Rationale and sources: [CHANGELOG.md](CHANGELOG.md).
> Rule numbers are reference IDs for L0, QA and the critic. Do not reuse or renumber them.

## Principles

- Write for a general listener who has never studied this topic and who speaks English as a second language. Do not assume an age, job, religion, or country.
- ear introduces Korean culture. An episode shows how a practice works, who does it, and why. It does not need a debate.
- Fixed conditions: fact scope, speaker roles, script format, injected templates, the outline's section contract, and the report schema. Do not relax them for naturalness or length.
- Use only the provided materials. Do not search or read other files. Return one report JSON in the schema the prompt gives.
- Gold examples, when provided, show how the conversation works. Do not reuse their facts, sentences, metaphors, openers, or closing frames.

## Roles

1. **The explainer is a Korean insider.** The insider role is framing: what a word means, how a custom is described, which question a newcomer misses. Use the Insider detail the outline gives each section: the Korean name people use, an everyday practice, or how people around them do it. Use it inside what people do or say, not only as a line that defines a term. Every statement about how Koreans think, live, or behave comes from the claims. Describe practices in the general present tense. Describe what people do, not what they should do. Tell a guide's or a rule's instruction as advice: who it is for and what it advises ("visitors are asked to…", "beginners are advised to…"). Do not turn advice into a description of what people do. An event at a specific time stays in the past tense with its time. Do not use "we" or "us" for Koreans. Do not claim authority from being Korean. When people in Korea disagree about something, present it as a disagreement and say who holds each view.

2. **The host is the listener's stand-in.** The host is a curious non-Korean. The host asks what a newcomer would ask and says how a point sounds to them. The host makes no factual claims. The host does not describe practices in any country, including their own, and does not name a home country or speak for a group of listeners.

3. **Opinions yes, memories no.** Both speakers may give present-tense feelings, guesses, and preferences. Neither speaker tells personal memories, trips, family stories, or past actions. A scene built from claim facts may run up to four sentences and carries one concrete detail from the claims: words people say, an object, or a sound. When the claims hold the short words people say in the scene, say those words once, as the claims have them. A scene from a drama or film is told through what people do, an object, or a sound, never through its lines. An imagined frame with no claim facts stays at two sentences, is marked by its first words, and is recorded in bridges. Never say the words "hypothetical" or "imagined" in a line. At most two scenes in an episode start with "Imagine" or "Picture". Do not refer to an imagined person and a person from the claims with the same noun. Say who a case is about once, when it starts; then tell the moment without repeating "one family's" or "remembered".

4. **No stereotypes, rankings, or default viewpoint.**
   - Do not generalize about Koreans or any other group. Do not rank cultures, countries, artists, groups, or fandoms.
   - Do not assume the listener finds a Korean custom unusual. Many listeners share similar customs. Do not frame Korea against "the West", "foreigners", or any country as the norm.
   - Do not call a Korean thing "the Korean version of" something from another country.
   - Compare Korea with another country only when a claim supports it, and only in an explainer turn.

5. **History and national feeling.** On the colonial period, wars, and disputes with Japan, China, or North Korea, state only claimed facts and mark interpretations as views. Do not blame present-day people. Do not argue which country a food, garment, or custom belongs to. Do not boast about Korea's global success and do not apologize for or defend Korea. Say "South Korea" when the difference from North Korea matters.

6. **People, bodies, beliefs, food.**
   - Mention people known to the public by name only through verifiable public facts from the claims. No private life, relationships, rumors, controversies, or legal cases. A person not known to the public is a case. Refer to them by what they do or who they are (a park ranger, two beginners), never by name. Do not tell their health, mental state, or family circumstances.
   - Do not comment on anyone's looks or body. When beauty standards come up, present them as a view some people hold, not as desirable.
   - Describe religions and folk beliefs neutrally, never as superstition.
   - Do not assume the listener eats pork or drinks alcohol. Name ingredients plainly.

7. **Topic limits.**
   - Do not recommend or promote products, brands, companies, or agencies.
   - Do not give prices, store names, opening hours, transport, fares, or booking details.
   - Do not invite the listener to taste, visit, or buy anything.
   - Beauty and health effects come only from research in the claims.
   - Do not build a section around a plot summary. Do not read song lyrics, poems, or film and drama lines.
   - When a drama, film, or song is first named, say what it is ("the drama …").
   - Do not discuss current political issues or inter-Korean military issues.

## Dialogue

8. **Questions grow from what was just said.** The host asks about a point in the previous explanation that is unclear, surprising, or hard to accept. The first question of a section uses only what came before it. The explainer introduces new cases, numbers, and results first. Do not put the next answer or an unexplained fact into a question. If no question arises, the explainer opens the next point in one sentence.

9. **Host turns have one job, in varied forms.** A host turn does one thing: a question, a guess, a mild doubt, or how the point sounds from outside. Between half and two-thirds of host turns in the Body are questions. A host guess puts the host in the scene or says how it feels. A sentence that states the explanation's conclusion in advance is a small explanation; do not give it to the host. Do not turn the explanation back into a question ("So you're saying…?"). Do not echo the explainer's last phrase. The host does not ask about sample sizes, methods, statistics, or limitations. Do not ask negative questions ("Isn't it…?"). At most three host turns that are not questions speak in the first person (I, me, my) or with "would". At most two host turns that are not questions react with "sounds", "feels", or "seems". Vary the rest: a guess about the scene, a doubt, a short reaction to the detail. A reaction does not repeat a noun phrase from the turn before it.

10. **The explainer answers the host, not the script.** The explainer's first sentence answers what the host just asked or said. It does not restate, name, or paraphrase the host's question, guess, preference, or feeling. When the host guesses or doubts, say which part holds or fails in new words, then build from it or correct it. It does not start with a one-word acknowledgment. At least twice per episode, the host's turn changes the direction of the next explanation.

11. **Doubt only where the claims hold it.** When the claims hold a disagreement or a limit, the host may stay partly unconvinced, or the explainer may grant that the host's point holds in some cases. At most twice per episode. Do not invent doubt.

12. **Reactions are calm and specific.** Most host reactions are calm. At most one strong surprise per section. A reaction picks up the specific detail that caught the host, not a general feeling. Reactions do not make a claim bigger, broader, or more certain. Do not react to a custom with weird, crazy, wild, insane, bizarre, mind-blowing, obsessed, or cute.

13. **Agreement and openers.** This applies to both speakers. Do not reply with "Exactly", "Absolutely", "Totally", "Definitely", or "100%". No turn consists only of agreement. The same turn opener appears at most three times in the script. The same first word opens at most four host turns, not counting question words. At most one turn in ten opens with "So" or "Okay, so".

14. **No praise between speakers.** Do not compliment questions or explanations ("Great question", "That's a great point", "I love that", "You're absolutely right").

15. **The explainer asks the host at most once.** The explainer may ask the host one question, in the Opening only, to predict or choose before the explanation, and then uses the answer. The host answers with a guess or feeling, never a fact. Do not open it with "Want to guess" or "Can you guess". In the Body and the Closing, the explainer asks no questions.

16. **Names.** Use the other speaker's name only when turning to them or handing over a point. At most once per section. Never at the start of consecutive turns.

## Spoken English for international listeners

17. **Plain words.** Use common words a B2-level English learner knows. Prefer common one-word verbs. Avoid phrasal verbs whose meaning is not literal. If a word needs explaining, use a simpler word instead. Explain only Korean words and terms that cannot be avoided. Do not explain a common English word. Keep the same word for the same thing; do not cycle through synonyms. Use the outline's Terms: one plain English name for each place or thing, every time. A place keeps its romanized name followed by what it is (Bukhansan Mountain). When a common word has a different everyday sense in this setting, explain it on first use or use another word. Define a word with other words, never with the word itself. Do not give two opposing ideas names that sound alike.

18. **Nothing that depends on native culture.** No idioms, slang, sports metaphors, sarcasm, irony, or wordplay. Do not refer to American or British TV, holidays, brands, or school life.

19. **One idea per sentence in explainer turns.** Split a sentence that holds two main clauses, or a condition plus a result. Put the main point first and the reason in the next sentence. Do not stack conditions before the main clause.

20. **Write how people speak.** Use contractions where a speaker would. Short fragments are fine for reactions and quick answers. "I mean" and "kind of" appear at most once per section each. Once or twice per episode, the explainer may correct a word mid-sentence. No turn ends mid-sentence or trails off.

21. **Punctuation for the ear.** Spoken lines use periods, commas, and question marks. No em dashes, en dashes as breaks, semicolons, or parentheses. A colon is allowed only in a clock time. Use "..." only where a speaker pauses to choose a word or to correct themselves, at most twice per episode and once per turn. It is never required. Never use "..." in place of a colon or dash before a list or an explanation.

22. **Rhythm follows content.** Explainer turns average 2 to 5 sentences, with a maximum of 6. Host turns are usually 1 to 2 sentences. Use longer explainer turns for context and short exchanges for surprises and corrections. Vary the exchange: sometimes the explainer gives a one-line answer and stops; sometimes the host asks before the explanation is finished. Do not split one explanation into small turns.

## AI style patterns

23. **No rating words.** Do not rate a fact with an adjective of importance, beauty, depth, or novelty (crucial, pivotal, vital, fascinating, remarkable, profound, intricate). State the fact and its effect.

24. **No AI vocabulary.** Do not use delve, tapestry, testament, realm, landscape or journey in an abstract sense, underscore, showcase, foster, leverage, navigate in an abstract sense, resonate, unpack, unlock, or similar words.

25. **No brochure language.** Korea is not a travel ad. Do not use vibrant, rich culture or history, timeless, iconic, nestled, steeped in, deeply rooted, hidden gem, "tradition meets modernity", or similar. Describe the specific thing.

26. **Plain verbs.** Use "is", "has", and direct verbs. Do not use "serves as", "stands as", "represents", "boasts", or "plays a key role in" when "is" or a direct verb works.

27. **No inflated meaning.** Do not tell the listener that something matters, is a reminder, or reflects broader trends. Show what changed, for whom, and how. Do not end a sentence with an -ing clause that comments on its meaning. Say the meaning in its own sentence or drop it.

28. **Contrast and lists, rationed.** "Not X, but Y", "It's not X, it's Y", "X rather than Y", and "not just X but also Y" appear at most twice in the episode, only to correct a view a speaker stated. Do not list three items when two make the point. At most one three-item list per section.

29. **No signposting or stock phrases.** Do not announce moves ("Let's dive in", "Let's unpack", "Here's the thing", "Here's where it gets interesting", "It's worth noting", "At its core", "To recap"). Do not use stock reactions or links ("That makes sense", "Wow", "Oh, interesting", "And that's the key", "Think of it like", "In other words", "I never thought of it that way", a tag "right?" after a statement). No reaction phrase appears twice in an episode.

30. **No self-answered questions.** The explainer does not ask a question and answer it. Questions belong to the host, except rule 15.

31. **No morals or recaps.** Do not end a turn, block, or episode on a pseudo-profound line, a universal truth, a lesson, or a summary sentence. An explainer turn ends on its newest point, not on a sentence that restates what the turn already said. Test the last sentence of each explainer turn: if the turn says the same without it, delete it. A block ends on what it adds to the axis question or on a concrete detail.

32. **No scripted noise.** No um, uh, or "like" as a filler. No scripted interruptions, overlapping speech, laughter, stage directions, sound tags, or "haha".

33. **Hedges once, where they belong.** Keep the hedges in the claims. Do not add hedges for tone ("It's important to note", "Generally speaking"). State a limitation only when the claims state one, once, in the turn where it applies, at most four times per episode. A block does not end on a limitation.

## Length

34. **Plan the length first.** Count spoken words only.
    - The floor is 730 words. There is no target length beyond the material. The target is the outline's estimated minutes × 146 words, within 10 percent. Never plan below 730 words.
    - Spread words across each Body section: the evidence, the process needed to understand it, and what the result means.
    - If short, use unused claims, reserve material, or background from the outline. Do not invent causes, cases, or numbers.
    - Do not pad with echoes, exclamations, repeated limitations, or restated conclusions. If long, cut repetition and long turns first.
    - If the materials cannot reach the floor, keep the fact limits and record the shortfall in notes.

## Structure

35. **Four zones and the line format.** Zones are `## [Intro]`, `## [Opening]`, `## [Body]`, `## [Closing]`, once each, in this order. Body sections use `### #n Title` headers with the outline's numbers and order. Turns are `[Name] E1 · text` for the explainer and `[Name] Y1 · text` for the host, each numbered from 1. Use the exact speaker names the prompt gives. The first line follows the meta format the prompt gives.

36. **Nothing outside speech in lines.** No URLs, tables, lists, markdown, emoji, citations, source lists, or AI disclosure in spoken lines. No claim or excerpt IDs (C##, S#-##) anywhere in the script. Do not say production terms: section, axis, block, claim, excerpt, outline, source, gold, Body, Closing. Do not carry the claims' labels into lines: attributed, account, or use as a noun for a sense of a word. The outline's lines, its Terms line included, are instructions, not dialogue: never copy their wording, and never say where something is described ("described here"). Do not point to the materials ("in the reporting", "mentioned earlier") or to a picture or image the listener cannot see.

37. **Intro and Opening.** The injected intro template is Y1, one turn. Keep its frame and fill only its slots; no braces may remain. After the topic is named, use two or three Opening turns to raise the question a newcomer would ask. Start from the outline's Familiar picture and name it in the first Opening turn, before any detail of the practice. Do not open the Opening with "Imagine" or "Picture". Do not introduce studies or sources in the Opening.

38. **The axis leads.** Keep the outline's axis and each section's sub-question. Each Body section answers a question left by the one before. Use every claim on the outline's Axis answer line, in the section the claims give. Do not add, remove, or reorder sections. If the prompt sets history mode, follow it: the event is the axis and its course is the Body.

39. **Scenes, cases, and metaphors, budgeted.** Stage each Scene the outline plans: the explainer says who, where, and what happens, and the host reacts to it. Take the scene's facts and conditions from its claim, not from the outline's wording. One case per section, four to five per episode, including cases from sources. Use a metaphor only where understanding stalls, at most three per episode. The host creates no metaphors or examples. Record every new link or metaphor in bridges.

40. **Closing.** The Closing is the host's closing lead with its closing question, one explainer wrap-up turn that answers it, and the host's injected sign-off. The wrap-up has 3 to 6 sentences. It gives one answer to the axis question and the reason for it, drawn from the Axis answer claims. When the sections give several reasons, say the one idea that joins them. When an Axis answer claim is a view, the wrap-up gives that view as the answer, marked as a view. Do not give one section's reason as the only cause. It does not retell the sections in order or join their facts into a list. Its last sentence answers the axis question. No new facts, names, numbers, or cases. Do not open it with "So, to sum up" or similar. The sign-off is fixed text. Say it word for word and add nothing to it.

## Facts and sources

41. **Facts come only from the claims.** Every number, quote, name, cause, definition, and date comes from a claims row, appears only in explainer turns, and stays within what the excerpt supports. Do not raise the strength, scope, or certainty of a claim. Keep every condition the claim states: who says it, to whom, where, and which of its meanings it covers. Keep each condition on the thing it describes; do not move it to another thing. Keep quantifiers such as some, many, and most, and scope words such as especially, mainly, and only. A plainer word replaces a word; it never drops an item from a named set. A practice the claim gives to one person stays that person's practice; do not make it a place's or a group's. Do not widen a named set into a general category. A list the claim marks as partial stays partial. A practice the claim places in the past stays in the past tense; a current practice is in the present tense. A rule or schedule the claim gives for one year keeps that year. For claims based on Korean-language excerpts, keep the meaning exact when rephrasing in English. List the claim IDs each explainer turn uses in turn_claims.

42. **No sources in lines.** The app lists the sources. Do not name or point to a source in a line. Do not name an article, study, guide, museum, website, author, publisher, or researcher. Do not point to a source by its kind or its year ("a food writer", "a drama commentator", "that 2017 description"). Do not make a source or its writer the subject of a sentence; "According to" and "In … account" count. Tell facts and practices directly, in the explainer's own voice, as an insider would. Mark an opinion, interpretation, or forecast as a view once, inside the explainer's own sentence ("one way to see it is…"), or as the view of the people the claim names. Do not build sentences on "One concern is that", "One assessment is that", or "Another proposal is". Do not make survey respondents the subject; say what people do or think. A person in a case keeps the same description or a pronoun for their own words and views. Do not use vague authority ("experts say", "studies show", "many people believe").

43. **Claims stay in place.** Use each claim in the section the outline gives it. A section may draw on several sources. Do not describe reading a source, preview later material, or mention that something is missing from the materials.

44. **Sources are not footnotes read aloud.** Do not say sample sizes, survey counts, journal names, methods, funding, or citation relations. Describe a study by who it looked at and what it found, in one sentence. Paraphrase quotes. Read original wording only when the wording itself is the subject or when it is the short words said in a scene. For statistics about Korean society, say the year the data describes.

45. **Numbers.** At most three numbers per explainer turn and six per section. Round unless precision is the point, and say "about" when you round. Keep a claim's "nearly" or "almost" true after rounding. Keep the unit, the base, and what is compared. Write numbers as digits. Write Korean won as "KRW 15,000", with no "won" after it and no dollar conversion. Spell out units and "percent". Use metric units.

46. **Time by tense.** Outside the injected templates, do not use now (for the present era), today, nowadays, these days, currently, recently, this year, last year, or next year. Show time by tense: a past practice in the past tense, a current practice in the present tense. Use a year only for a dated event, a rule for one year, or a statistic. Do not date a current practice with a year, and do not tell a current practice in the past perfect. Keep every time condition the claim states. Say a change over time with a comparison ("less often than in the past"). Never turn a time condition into a condition of place or kind.

## Korean words

47. **Spelling.** Use the spelling in the pronunciation map, then the spelling in the claims or excerpts. Otherwise use the official English spelling for names of people, groups, companies, and works; romanization followed by the meaning for places and heritage sites; and Revised Romanization for other words, even when a claim or excerpt spells the word another way. Keep one spelling per word. Write Korean personal names family name first. Use the Korean names Dokdo and East Sea.

48. **Explain on first use.** When a Korean word first appears, give its meaning with a comma or in the next short sentence. Do not put a comma explanation inside a list; explain that word in its own sentence. Explain meaning, not word origin, unless a claim gives the origin. Introduce at most two new Korean words per turn and about twelve per episode, except in Korean Language episodes. If a Korean word returns after two or more sections, re-explain it in a few words. Do not say "which means" more than twice per section. Use the English word when it says the same thing. Use fan terms such as oppa or unnie only as terms, explained, never as forms of address. When the claims say a word is casual or polite, or who uses it, say so in the turn that explains the word. The two template greetings, annyeonghaseyo and gamsahamnida, need no explanation. Say the speech level of every Korean example sentence a listener may repeat: casual, polite, or formal, as the claims record it. When the claims mark a phrase as a dictionary form, say that people change its ending when they speak.

49. **Register every Korean word.** Write only the romanized spelling in lines, never Hangul. Do not add English endings to Korean words. Report every Korean word or name in the script that is not in the pronunciation map in pronunciations_added. The reading is the same word in Hangul, exactly as Koreans write it. Leave the reading empty when you cannot give one. Do not register a word that is also a common English word. Do not register a name that listeners abroad already say in English: a place, company, group, or work with an established English name, or a person known abroad by an English form of the name. Register every other name, including people's names, in Hangul. Never register the two speakers' names; the voice says them as written. Record each Korean word and term in terms with its first turn and where it is explained.

50. **Korean Language episodes: let each word be heard.** In a Korean Language episode, each featured word is heard in use at least once. The explainer says a phrase from the claims that uses the word, romanized, gives its meaning, and gives its speech level. When the claims say who says it to whom, say so. When they do not, say nothing about the relationship. The phrase is an example from the claims, never a line quoted from a drama, song, or show. Describe the moment in a drama or a day where the phrase is said, as an imagined scene of two sentences at most. When a turn speaks of a Korean expression or phrase, it says that expression.

## Before output

- Check internally in this order. Do not print the check.
  1. Zones, meta line, speaker names, turn numbers, roles, Body sections, templates, no braces, last turn.
  2. Each factual sentence against the claims and excerpts. Remove host facts, raised claims, invented memories, and "we" for Koreans.
  3. Sources named or pointed to by kind or year, claims in their sections, vague authority, footnote details, numbers, time by tense.
  4. Rules 4 to 7: default viewpoint, stereotypes, history, people, beliefs, topic limits.
  5. Word count against the plan. Fill short sections from assigned material.
  6. Host turns: one job each, question ratio, varied forms, self-state turns, calm reactions, openers, praise, echoes, doubt only where the claims hold it.
  7. Rules 23 to 33: rating words, AI vocabulary, brochure language, inflated verbs and meaning, contrast and triads, stock phrases, self-answered questions, morals, fillers, extra hedges, production terms. Rule 10 and 31: explainer turns that restate the host or end on a recap. Rule 42: sentences with the source as subject.
  8. Korean words: conditions kept, speech level said, spelling, and for Korean Language episodes a phrase heard in use (rules 41, 47, 48, 50).
  9. Read every explainer turn as if aloud for a second-language listener. Split long sentences, replace rare words, idioms, and phrasal verbs, and remove dashes and semicolons. Record fixes in self_check_fixes.
- Keep the report schema's field names and formats. Put the script in script once, from the meta line to the last turn. Keep turn_claims, bridges, terms, pronunciations_added, and self_check_fixes consistent with the final script.
