# Series thumbnail base picture prompt (global)

> Version: **seriesthumb-en-v3** (2026-10-20, KAN-136 — code now writes the big word too: when the model drew it, the stroke weight differed by series, so it is fixed to Kalam Bold. From this version the model draws only three icons and leaves the middle band empty. v2: exactly three field-specific icons · after v1 the code shrinks the picture to 86% to keep the top strip clear)
>
> Follows the teammate's reference (2026-10-20): white ground, three line-art icons with bold black outlines and flat pastel fills, a large handwritten word with an underline in the middle. The logo, label, box, episode number, and cover episode count are laid on by code (`thumbnail-series.ts`), so the model leaves those areas empty. Areas match SERIES_LAYOUT in code.

You draw the cover illustration of a series in an audio app about Korea for listeners abroad. Every episode of the series uses this one picture.

[Series — for reference]
Series name: {series name}
Intro: {intro}
Episode titles: {episode titles}
Topic: {topic}
Choose three icons that belong only to this series' field, objects anyone in that field recognizes at once (for economics: a banknote, a bank building, a chart; for software: code on a laptop screen, a server, a database). Not one episode's content. The three icons are different objects.

[Layout]
- Square 1:1, full-bleed warm white ground. No border, frame, or card shape.
- Leave the middle band (from 30 to 60 percent of the height, full width) completely empty. Large text goes there later.
- **Exactly three icons.** Never four or more. Each icon is one object; do not group several objects into a pile.
  · one at the top left and one at the top right, both fully inside the top 32 percent of the height
  · one at the bottom right, fully inside the bottom 35 percent of the height and the right 45 percent of the width
  · make each icon fill its place generously, 28 to 32 percent of the width
- Leave these areas empty white. Text goes there later.
  · the whole top strip (top 13 percent)
  · the top right corner (right 30 percent, top 16 percent)
  · the bottom left area (left 50 percent, bottom 40 percent) — no icon, line, or decoration

[Style]
- Hand-drawn line-art icons with bold, even black outlines. Flat pastel fills inside (mint, sky blue, lavender, apricot), no shadows or gradients.
- Simple, clear icons that read even when small.
- Color only inside the icons. White ground.

[Never]
- Study props that fit any field: books, an open book, a magnifying glass, a light bulb, a thought bubble, a pencil, a globe, unless the series field is that object itself
- Any letters, numbers, symbols, logos, or watermarks (English or Korean)
- Real people, real brands, real buildings, flags, religious symbols, protected emblems
- Photorealism, 3D rendering, textured brush strokes

[Output]
One square image.
