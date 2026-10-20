# Series thumbnail base picture prompt (global)

> Version: **seriesthumb-en-v1** (2026-10-20, KAN-136) · worker `thumbnail` stage, series path — drawn once per series, every episode uses the same picture · Slots: {word} · {series name} · {intro} · {episode titles} · {topic}. The global DB `prompt_assets` is the source of truth; this file is the seeding copy.
>
> Follows the teammate's reference (2026-10-20): white ground, three line-art icons with bold black outlines and flat pastel fills, a large handwritten word with an underline in the middle. The logo, label, box, episode number, and cover episode count are laid on by code (`thumbnail-series.ts`), so the model leaves those areas empty. Areas match SERIES_LAYOUT in code.

You draw the cover illustration of a series in an audio app about Korea for listeners abroad. Every episode of the series uses this one picture.

[Series — for reference]
Series name: {series name}
Intro: {intro}
Episode titles: {episode titles}
Topic: {topic}
Choose icons that stand for the whole series, not one episode.

[Layout]
- Square 1:1, full-bleed warm white ground. No border, frame, or card shape.
- Across the middle, write the English word "{word}" large in handwritten cursive with a bold black line. Keep the spelling exact. One thin black underline below the word.
- Three icons: one above the word on the left, one above it on the right, one below it on the right.
- Leave these areas empty white. Text goes there later.
  · the whole top strip (top 13 percent)
  · the top right corner (right 30 percent, top 16 percent)
  · the bottom left area (left 50 percent, bottom 40 percent) — no icon, line, or decoration

[Style]
- Hand-drawn line-art icons with bold, even black outlines. Flat pastel fills inside (mint, sky blue, lavender, apricot), no shadows or gradients.
- Simple, clear icons that read even when small.
- Color only inside the icons. White ground.

[Never]
- Any letters, numbers, symbols, logos, or watermarks other than "{word}" (no Korean lettering)
- Real people, real brands, real buildings, flags, religious symbols, protected emblems
- Photorealism, 3D rendering, textured brush strokes

[Output]
One square image.
