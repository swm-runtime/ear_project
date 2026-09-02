/**
 * 앱의 브랜드 마크(`frontend/assets/logo.png`)에서 랜딩페이지용 이미지를 만든다.
 *
 * 산출물은 커밋되므로 이 스크립트는 빌드에 끼우지 않는다. 원본 로고가 바뀔 때만 손으로 돌린다:
 *   node scripts/brand-assets.mjs
 *
 * 원본을 그대로 못 쓰는 이유가 셋이다.
 * 1. 772KB짜리 1254px 이미지다 — 26px로 그리는 헤더 로고에 쓸 무게가 아니다.
 * 2. 알파가 없다. 흰 배경이 사각형으로 딸려 오므로 흰 면 위에서만 쓸 수 있다.
 * 3. 그림 둘레에 여백이 크게 남아 있다. 그대로 축소하면 마크가 실제보다 작게 보인다.
 *
 * 그래서 잉크의 바운딩 박스로 자르고, 밝기를 알파로 뒤집어 투명 배경으로 만든다.
 * (원본이 흰 바탕의 검은 선화라 밝기 = 배경, 그 반대 = 잉크로 정확히 갈린다.)
 */
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "../frontend/assets/logo.png");

/** 이 값보다 어두우면 잉크로 본다. 원본 배경은 거의 순백이라 넉넉히 잡아도 안전하다. */
const INK_THRESHOLD = 220;
/** 잘라낸 잉크 둘레에 남길 여백(짧은 변 대비 비율). 0이면 글자에 너무 붙는다. */
const PADDING_RATIO = 0.04;

/** 잉크가 실제로 차지하는 사각형을 찾는다. */
async function inkBox(input) {
  const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] < INK_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("잉크를 찾지 못했다 — 원본이 비었거나 임계값이 잘못됐다");

  const pad = Math.round(Math.min(maxX - minX, maxY - minY) * PADDING_RATIO);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  return {
    left,
    top,
    width: Math.min(w - left, maxX - minX + 1 + pad * 2),
    height: Math.min(h - top, maxY - minY + 1 + pad * 2),
  };
}

/**
 * 잘라낸 마크를 단색 + 알파로 만든다.
 * 밝기를 뒤집어 알파로 쓰므로 선 끝의 안티에일리어싱이 그대로 보존된다.
 */
async function tintedMark(box, width, [r, g, b]) {
  const alpha = await sharp(SRC)
    .extract(box)
    .greyscale()
    .negate() // 잉크(어두움) → 불투명, 배경(밝음) → 투명
    .resize({ width, fit: "inside" })
    .toBuffer();

  const { width: w, height: h } = await sharp(alpha).metadata();

  return sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
}

const box = await inkBox(SRC);
console.log(`잉크 영역  ${box.width}×${box.height}  (원본 1254×1254에서 잘라냄)`);

/* ── 1. 헤더·바닥글용 마크 — 검정, 투명 배경 ──
   26~30px로 그리므로 3배수인 480px면 고해상도 화면에서도 충분하다. */
const markPath = join(root, "public/logo.png");
const mark = await tintedMark(box, 480, [0, 0, 0]);
await writeFile(markPath, mark);
const markMeta = await sharp(mark).metadata();
console.log(`mark  public/logo.png  ${markMeta.width}×${markMeta.height}  ${(mark.byteLength / 1024) | 0}KB`);

/* ── 2. 파비콘 — 검은 둥근 사각형에 흰 마크 ──
   32px 탭에서도 보이려면 선화만으로는 너무 옅다. 면으로 받쳐 준다.
   모서리 반경은 원래 쓰던 icon.svg와 같은 비율(15/64)을 유지한다. */
async function appIcon(size) {
  const radius = Math.round(size * (15 / 64));
  const inner = Math.round(size * 0.66);
  const white = await tintedMark(box, inner, [255, 255, 255]);
  const { width: mw, height: mh } = await sharp(white).metadata();

  const square = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite([
      {
        input: white,
        left: Math.round((size - mw) / 2),
        top: Math.round((size - mh) / 2),
      },
    ])
    .png()
    .toBuffer();

  // 둥근 모서리는 마스크로 깎는다(dest-in = 마스크의 알파만 남긴다).
  const roundedMask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`
  );
  return sharp(square)
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

await mkdir(join(root, "src/app"), { recursive: true });
for (const [size, file] of [
  [512, "src/app/icon.png"],
  [180, "src/app/apple-icon.png"],
]) {
  const png = await appIcon(size);
  await writeFile(join(root, file), png);
  console.log(`icon  ${file}  ${size}×${size}  ${(png.byteLength / 1024) | 0}KB`);
}
