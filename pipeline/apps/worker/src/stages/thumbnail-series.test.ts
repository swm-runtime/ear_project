import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { composeSeriesThumb, seriesCountText, seriesLogo } from "./thumbnail-series.js";
import { versionOf } from "../assets.js";

// 시리즈 썸네일 (KAN-136, 2026-10-20) — 같은 바탕에 편은 번호, 표지는 편수를 코드가 얹는다
const blank = () => sharp({ create: { width: 1254, height: 1254, channels: 3, background: "#FDFDFC" } }).png().toBuffer();
const pixels = async (png: Buffer, box: { left: number; top: number; width: number; height: number }) => (await sharp(png).extract(box).raw().toBuffer()).reduce((n, v) => n + (v < 128 ? 1 : 0), 0);

test("편 썸네일 — 1024 정사각, 번호만 다르고 나머지 글자 자리는 같다", async () => {
  const base = await blank();
  const t = { logo: seriesLogo(false), label: "KEYWORD SERIES", box: "경제편" };
  const one = await composeSeriesThumb(base, { ...t, no: 1 });
  const two = await composeSeriesThumb(base, { ...t, no: 2 });
  const m = await sharp(one).metadata();
  assert.equal(m.width, 1024); assert.equal(m.height, 1024);
  const top = { left: 0, top: 0, width: 1024, height: 700 };
  assert.equal(await pixels(one, top), await pixels(two, top)); // 로고·라벨·박스 위쪽은 같다
  const noArea = { left: 40, top: 930, width: 140, height: 90 };
  assert.ok(await pixels(one, noArea) > 0);
  assert.notDeepEqual(await sharp(one).extract(noArea).raw().toBuffer(), await sharp(two).extract(noArea).raw().toBuffer());
});

test("표지 — 번호 자리는 비우고 편수를 오른쪽 위 라벨 아래에 둔다(앱 카드 아래 변은 '시리즈' 표식이 덮는다)", async () => {
  const base = await blank();
  const cover = await composeSeriesThumb(base, { logo: "이어", label: "KEYWORD SERIES", box: "경제편", no: null, count: seriesCountText(16, false) });
  assert.equal(await pixels(cover, { left: 40, top: 930, width: 140, height: 90 }), 0);
  assert.ok(await pixels(cover, { left: 700, top: 100, width: 300, height: 80 }) > 0);
  assert.equal(seriesCountText(16, true), "16 EPISODES");
  assert.equal(seriesLogo(true), "Earcast");
});

test("시리즈 썸네일 자산 — 버전 라벨 seriesthumb-v1 · seriesthumb-en-v1, 칸 이름이 코드와 같다", async () => {
  const root = path.resolve(import.meta.dirname, "../../../../../docs/ai");
  const ko = await fs.readFile(path.join(root, "skills/thumbnail/series.md"), "utf8");
  const en = await fs.readFile(path.join(root, "global/skills/thumbnail/series.md"), "utf8");
  assert.equal(versionOf("skills/thumbnail/series.md", ko), "seriesthumb-v1");
  assert.equal(versionOf("skills/thumbnail/series.md", en), "seriesthumb-en-v1");
  for (const slot of ["{큰 단어}", "{시리즈 이름}", "{소개}", "{편 제목들}", "{분야}"]) assert.ok(ko.includes(slot), slot);
  for (const slot of ["{word}", "{series name}", "{intro}", "{episode titles}", "{topic}"]) assert.ok(en.includes(slot), slot);
});
