# Thumbnail image prompt (global)

> Version: **thumb-en-v1** (2026-10-16) · global pipeline · worker `thumbnail` stage, scene path (same structure as the Korean thumb-v4). Slots: {title} · {topic} · {band color} · {scene} · {light}. The global DB `prompt_assets` is the source of truth; this file is the seeding copy.
>
> References: the user's three posters (2026-10-16), used for two things only — the illustration style (bright, polished, semi-realistic painting) and the use of objects (one main subject surrounded by a few recognizable Korean objects that name the topic). Color is not taken from them: each scene takes the colors of its own subject, place, and light (user decision). No lettering at all — thumbnails are small (user decision). The code hangs a fixed Korean bookmark in the topic color (najeonchilgi-style lacquer plaque, dancheong bands, a fixed mother-of-pearl motif per topic, maedeup knot and tassel) from the top edge near the right corner (`thumbnail-compose.ts` BOOKMARK, user decision 2026-10-16); the model leaves that strip as plain background. Bans from global spec 6.8: real people's faces and lookalikes, agency, broadcaster, and brand logos, album art and poster imitation, Korean lettering.

You paint the episode thumbnail for an audio app about Korea for listeners abroad.

[Episode — for reference]
Title: {title}
Topic: {topic}
Choose places and objects that make this topic clear. Never write the title or any words.

[Format]
- Square 1:1, full-bleed to every edge. Square corners. No border, frame, margin, or rounded card.
- The same image is shown from 44 pt (tiny) to 340 pt (full screen width).
- A {band color} bookmark will later hang from the top edge near the right corner: a vertical strip from 85% to 95% of the width, from the top down to 40% of the height.
  · Put no person, face, or main object in that strip.
  · Keep that strip as plain background: sky, window light, wall, or foliage.
  · Do not use the {band color} hue family in that strip.
  · Do not draw a bookmark, ribbon, tag, band, or triangle yourself.

[What to paint]
- Paint the [Scene] below as one picture. One main subject, large, within the lower two-thirds. Up to three supporting objects around it, each a recognizable Korean object that tells the topic.
- At small size the main subject reads as one clear shape. At full size the supporting objects and the place read.
- Give every object room. No piles of small props or scattered decorations.
- Clear contrast between the subject and the background. Do not leave the whole background white.

[Style]
A painted illustration, not a photograph: polished semi-realistic digital painting with soft brushwork and simplified textures, like a premium lifestyle poster. Bright and warm, with gentle glow and airy depth. Colors come from the scene's own subject, place, season, and light. Natural proportions.

[People]
- At most two people, only if the scene has them. Ordinary people of any age, in everyday clothes.
- Show them at medium distance, from the side, or from behind. No portrait close-up of a face.
- No resemblance to any real person, celebrity, or idol. No stage outfits, idol styling, or fan merchandise.

[Never]
- Letters, words, numbers, Hangul, symbols, signs, labels, logos, stamps, watermarks, or readable screens. Paper, books, packages, and screens are plain surfaces.
- Real brands, agency or broadcaster marks, album covers, drama or film posters, or scenes copied from a real drama, film, or music video.
- National flags, protected emblems such as the red cross, and religious symbols.
- Landmarks, buildings, or towers that the [Scene] does not name.
- Light bulbs, brains, hearts, scales, magnifying glasses, gears, puzzle pieces, cycle arrows, toggle switches, chess pieces, or globes, unless the scene names them.
- A photograph, photorealistic rendering, camera depth-of-field look, or stock-photo look.

[Scene]
{scene}

[Time and light]
{light}

[Output]
One square image.

---

## Topic colors (global spec 6.8)

The code fills `{band color}` with the representative topic's color (`thumbnail.ts` DEFAULT_BAND_COLORS_EN; the console setting `thumbnail.colors` overrides it). The bookmark images in `apps/worker/assets/thumbnail-bookmarks/` use the same colors, with a fixed motif per topic: Korean Language books (chaekgado) · Korean Culture tiger and magpie (minhwa) · K-Food onggi jar · K-Pop janggu drum · K-Drama & Film Hahoe mask · K-Beauty & Fashion peony (minhwa) · Travel in Korea five peaks and sun (Irworobongdo) · Korean History & Society cranes and clouds (hyungbae). A topic without a bookmark falls back to the corner triangle.

| Topic | Color | HEX |
|---|---|---|
| Korean Language | navy | #2B4C7E |
| Korean Culture | crimson | #B03A48 |
| K-Food | persimmon orange | #D9772B |
| K-Pop | magenta | #C2367A |
| K-Drama & Film | teal | #2A7F9E |
| K-Beauty & Fashion | violet | #6A4C93 |
| Travel in Korea | forest green | #4B7B3A |
| Korean History & Society | walnut brown | #6B4A2E |
