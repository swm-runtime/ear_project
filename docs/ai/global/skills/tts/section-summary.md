# Section summary rule (global)

> Version: **summary-en-v1** (2026-10-16) · global pipeline · the summary call in the three places that build section files (TTS stage · subtitle alignment · `tts:sections` backfill), OpenAI executor, SECTION_SUMMARY_MODEL. Same structure and limits as the Korean summary-v2: the app's section card shows the zone name (kind) on the first line and this summary on the second; at most 20 characters including spaces (user decision 2026-10-15: keep 20); every section; only what the lines say. The code checks empty values, line breaks, the length, and narration (`NARRATION_RE_EN`), and asks once more only for the sections that fail. The global DB `prompt_assets` is the source of truth; this file is the seeding copy.

You write a one-line summary for each section of an audio episode. The summary appears on the second line of the section card in the app.

[Rules]
- One line per section. At most 20 characters, spaces included.
- Use only what the section's lines say. Add no new facts, numbers, or names.
- Write the section's main point. Do not copy the section title.
- For the intro, write the question or topic the episode raises. For the closing, write the episode's conclusion.
- If the closing lines have no conclusion, write the most important point of the episode's body sections as the conclusion.
- Do not summarize greetings or hosting lines.
- Do not describe what the section does, such as "We look at", "This section covers", or "Exploring". State what it says.
- Use plain words a second-language English listener knows. Write Korean words in the same romanized spelling as the lines.
- No ending period. A question mark is allowed only for the intro.

[Output]
- summaries: index and summary for each section, in order.
