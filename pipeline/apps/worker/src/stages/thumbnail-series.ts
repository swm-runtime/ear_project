import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";

/**
 * 시리즈 썸네일 합성 (KAN-136, 2026-10-20 — 팀원 레퍼런스 "이어 · KEYWORD SERIES · keyword · 경제편 · 01").
 *
 * 시리즈의 모든 편은 **같은 바탕 그림**(이미지 모델이 시리즈당 한 번 — 아이콘 셋만)을 쓰고, 나머지는 여기서 얹는다:
 * 왼쪽 위 로고 마크 · 오른쪽 위 라벨 · 가운데 손글씨 큰 단어와 밑줄 · 왼쪽 아래 박스 · 편 번호(왼쪽 아래 "01").
 * 큰 단어도 코드가 쓴다(seriesthumb-v3) — 모델이 그리면 시리즈마다 획 굵기가 달랐다(박수헌 2026-10-20 — 후보 39개 비교 끝에 Damion + 얇은 획 덧칠로 고정. Damion 은 Regular 한 굵기만 있다).
 *
 * 글자는 **폰트 파일의 글리프 윤곽을 SVG 경로로 바꿔** 그린다(opentype.js). sharp 의 글자 렌더(pango)는 fontconfig 설정이 없으면
 * fontfile 을 무시하고 시스템 글꼴로 대체했다(맥 시험에서 Pretendard 대신 Helvetica, 알파인 서버에는 글꼴이 아예 없다). 경로는 어디서나 같다.
 *
 * 표지(제품 시리즈 표지)는 번호 대신 편수("전 16편")를 **라벨 아래 오른쪽 위**에 둔다(A′안, 박수헌 2026-10-20) —
 * 앱 시리즈 카드가 표지 아래 변을 "시리즈" 표식으로 덮어서(KAN-225 결정 2) 왼쪽 아래 번호 자리는 가려진다.
 */

const ASSET_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets");
const LOGO_MARK = path.join(ASSET_DIR, "brand/logo-mark.png"); // 앱·랜딩과 같은 마크(landing-page/public/logo.png — 여백을 잘라낸 투명 판)
const INK = "#111111";
const BG = "__BG__"; // 바탕색 자리 — 바탕 그림의 둘레색을 잰 뒤 채운다

let fonts: { bold: opentype.Font; heavy: opentype.Font; hand: opentype.Font } | null = null;
const loadFonts = () => (fonts ??= {
  bold: opentype.loadSync(path.join(ASSET_DIR, "fonts/Pretendard-Bold.otf")),
  heavy: opentype.loadSync(path.join(ASSET_DIR, "fonts/Pretendard-ExtraBold.otf")),
  hand: opentype.loadSync(path.join(ASSET_DIR, "fonts/Damion-Regular.ttf")),
});

/** 한 변 대비 비율 — 레퍼런스 실측을 시험 4편(CS·경제·서양·동양 철학)으로 고친 값 */
export const SERIES_LAYOUT = {
  margin: 0.056,                                   // 로고·번호 왼쪽 여백
  logo: { top: 0.03, height: 0.09 },
  label: { right: 0.052, baseline: 0.082, size: 0.032, tracking: 0.12 },
  count: { baseline: 0.142, size: 0.05 },
  word: { baseline: 0.61, width: 0.68, maxSize: 0.22, underlineGap: 0.024, underlineFrom: 0.12, underlineTo: 0.88, underlineWidth: 0.0055, halo: 0.024, weight: 0.012 }, // 위 아이콘(바탕 위 32%)과 아래 아이콘(아래 35%) 사이 — 시험 v4 에서 위 아이콘이 45% 까지 내려왔다
  box: { left: 0.074, top: 0.73, width: 0.30, height: 0.12, radius: 0.012, size: 0.085 },
  no: { baseline: 0.952, size: 0.066 },
  /** 바탕 그림을 이 비율로 줄여 아래에 놓는다 — 위 띠(로고·라벨·편수)를 항상 비운다. 모델은 빈 자리 지시를 지키지 않았다(시험 4편 중 3편이 로고와 겹침) */
  art: { scale: 0.86, top: 0.12 },
} as const;

export interface SeriesThumbText {
  /** 가운데 손글씨 큰 단어(thumb_word) */
  word: string;
  /** 오른쪽 위 라벨(thumb_label) */
  label: string;
  /** 왼쪽 아래 박스(thumb_box) — 비면 박스를 그리지 않는다 */
  box: string;
  /** 편이면 번호(1부터), 표지면 null */
  no: number | null;
  /** 표지 편수 글자 — "전 16편" / "16 EPISODES". 편이면 무시 */
  count?: string;
}

/** 글자 한 줄을 경로로 — x 는 왼쪽 끝, y 는 기준선. tracking 은 em 비율의 자간. 경로와 실제 그려진 상자를 돌려준다 */
function textPath(font: opentype.Font, text: string, x: number, y: number, size: number, tracking = 0): { d: string; box: { x1: number; y1: number; x2: number; y2: number }; advance: number } {
  const p = new opentype.Path();
  let cx = x;
  const glyphs = font.stringToGlyphs(text);
  glyphs.forEach((g, i) => {
    p.extend(g.getPath(cx, y, size));
    const kern = i + 1 < glyphs.length ? font.getKerningValue(g, glyphs[i + 1]) : 0;
    cx += ((g.advanceWidth ?? 0) + kern) * (size / font.unitsPerEm) + (i + 1 < glyphs.length ? tracking * size : 0);
  });
  const b = p.getBoundingBox();
  return { d: p.toPathData(2), box: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 }, advance: cx - x };
}

/** 바탕 그림 + 로고·글자 → 정사각 PNG. 바탕은 size 로 맞춘다(모델 출력이 1024 가 아니어도 같은 비율로 얹는다) */
export async function composeSeriesThumb(base: Buffer, t: SeriesThumbText, size = 1024): Promise<Buffer> {
  const L = SERIES_LAYOUT;
  const F = loadFonts();
  const at = (v: number) => v * size;
  const parts: string[] = [];

  // 오른쪽 위 라벨 — 오른쪽 끝을 맞춘다
  if (t.label.trim()) {
    const probe = textPath(F.bold, t.label.trim().toUpperCase(), 0, 0, at(L.label.size), L.label.tracking);
    const x = size - at(L.label.right) - probe.advance;
    parts.push(`<path d="${textPath(F.bold, t.label.trim().toUpperCase(), x, at(L.label.baseline), at(L.label.size), L.label.tracking).d}" fill="${INK}"/>`);
  }

  // 가운데 큰 단어 — 폭에 맞춰 크기를 정하고(상한 maxSize) 가운데에, 밑줄은 고정 자리
  if (t.word.trim()) {
    const w = t.word.trim();
    const unit = textPath(F.hand, w, 0, 0, 100);
    const fit = Math.min(at(L.word.maxSize), (at(L.word.width) / (unit.box.x2 - unit.box.x1)) * 100);
    const probe = textPath(F.hand, w, 0, 0, fit);
    const x = (size - (probe.box.x2 - probe.box.x1)) / 2 - probe.box.x1;
    // 바탕색 테두리(halo)를 먼저 깐다 — 모델이 아이콘을 가운데 띠에 조금 걸쳐 그려도(시험 v6 넷 중 셋) 글자가 아이콘 위에 스티커처럼 또렷하다
    const d = textPath(F.hand, w, x, at(L.word.baseline), fit).d;
    const uy = at(L.word.baseline + L.word.underlineGap);
    const line = (stroke: string, width: number) => `<line x1="${at(L.word.underlineFrom)}" y1="${uy}" x2="${at(L.word.underlineTo)}" y2="${uy}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
    parts.push(`<path d="${d}" fill="${BG}" stroke="${BG}" stroke-width="${at(L.word.halo)}" stroke-linejoin="round"/>`, line(BG, at(L.word.underlineWidth + L.word.halo)));
    // weight: 글꼴 크기 대비 획 덧칠 — 작은 썸네일에서도 획이 끊겨 보이지 않을 만큼만(0.03 은 너무 굵다, 박수헌)
    parts.push(`<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="${fit * L.word.weight}" stroke-linejoin="round"/>`, line(INK, at(L.word.underlineWidth)));
  }

  // 왼쪽 아래 박스 — 글자가 박스보다 넓으면 줄인다(영어 박스 "ECONOMY"는 한글보다 넓다)
  if (t.box.trim()) {
    const b = L.box;
    const bw = at(b.width), bh = at(b.height);
    let fs = at(b.size);
    let probe = textPath(F.heavy, t.box.trim(), 0, 0, fs);
    if (probe.box.x2 - probe.box.x1 > bw * 0.84) { fs = fs * (bw * 0.84) / (probe.box.x2 - probe.box.x1); probe = textPath(F.heavy, t.box.trim(), 0, 0, fs); }
    const tx = at(b.left) + (bw - (probe.box.x2 - probe.box.x1)) / 2 - probe.box.x1;
    const ty = at(b.top) + (bh - (probe.box.y2 - probe.box.y1)) / 2 - probe.box.y1;
    parts.push(`<rect x="${at(b.left)}" y="${at(b.top)}" width="${bw}" height="${bh}" rx="${at(b.radius)}" fill="${INK}"/>`);
    parts.push(`<path d="${textPath(F.heavy, t.box.trim(), tx, ty, fs).d}" fill="#FFFFFF"/>`);
  }

  // 편 번호(왼쪽 아래) 또는 표지 편수(라벨 아래 오른쪽)
  if (t.no != null) {
    parts.push(`<path d="${textPath(F.bold, String(t.no).padStart(2, "0"), at(L.margin), at(L.no.baseline), at(L.no.size)).d}" fill="${INK}"/>`);
  } else if (t.count?.trim()) {
    const probe = textPath(F.heavy, t.count.trim(), 0, 0, at(L.count.size));
    parts.push(`<path d="${textPath(F.heavy, t.count.trim(), size - at(L.label.right) - probe.advance, at(L.count.baseline), at(L.count.size)).d}" fill="${INK}"/>`);
  }

  // 바탕을 줄여 아래 가운데에 놓는다 — 둘레는 바탕 네 귀퉁이의 평균색(모델이 그린 흰 바탕과 이음매가 없게)
  const artPx = Math.round(at(L.art.scale));
  const rawArt = await sharp(base).resize(artPx, artPx, { fit: "cover" }).png().toBuffer();
  const { data, info } = await sharp(rawArt).raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => [0, 1, 2].map((c) => data[(y * info.width + x) * info.channels + c]);
  const corners = [px(2, 2), px(info.width - 3, 2), px(2, info.height - 3), px(info.width - 3, info.height - 3)];
  const [r, g, bl] = [0, 1, 2].map((c) => Math.round(corners.reduce((n, k) => n + k[c], 0) / corners.length));

  // 가장자리를 둘레색으로 번지게 — 모델 바탕이 가운데와 가장자리에서 미세하게 달라 사각형 테두리가 비쳤다(시험 v4 경제편)
  const feather = Math.round(artPx * 0.035);
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${artPx}" height="${artPx}"><rect x="${feather}" y="${feather}" width="${artPx - 2 * feather}" height="${artPx - 2 * feather}" fill="#fff"/></svg>`)).blur(feather / 2).png().toBuffer();
  const art = await sharp(rawArt).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const logoH = Math.round(at(L.logo.height));
  const logo = await sharp(LOGO_MARK).resize({ height: logoH }).png().toBuffer();
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${parts.join("").replaceAll(BG, `rgb(${r},${g},${bl})`)}</svg>`);
  return sharp({ create: { width: size, height: size, channels: 3, background: { r, g, b: bl } } })
    .composite([
      { input: art, left: Math.round((size - artPx) / 2), top: Math.round(at(L.art.top)) },
      { input: logo, left: Math.round(at(L.margin)), top: Math.round(at(L.logo.top)) },
      { input: overlay, left: 0, top: 0 },
    ]).png().toBuffer();
}

/** 표지 편수 글자 — 한국판 "전 N편", 글로벌판 "N EPISODES" */
export const seriesCountText = (total: number, en: boolean) => (en ? `${total} EPISODES` : `전 ${total}편`);
