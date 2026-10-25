import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";

/**
 * 회화집(Phrasebook) 시리즈 썸네일 합성 (KAN-247 후속, 2026-10-26 박수헌 — 시안 D "포켓 회화집" 확정).
 *
 * 간행물 스타일 `phrasebook`(@ear/pipeline publication.ts)의 편 썸네일·표지. 작은 책 한 권을 그린다 — 왼쪽 검은 제본 띠(세로 글자),
 * 오른쪽 책장 결, 표지에 그 편의 표현(로마자) 두세 줄 · 한글 · 뜻 한 줄, 오른쪽 위 빨간 책갈피 리본에 편 번호. 표지는 리본 없이 편수와 손글씨.
 * **이미지 모델을 부르지 않는다** — 전부 코드가 그려 편마다 결과가 흔들리지 않고 비용이 0이다(키워드 디자인과 다른 점).
 * 글자는 thumbnail-series.ts 와 같은 방식(폰트 윤곽 → SVG 경로)으로 그린다 — 서버에 글꼴이 없어도 같다.
 *
 * 편마다 다른 글자: 로마자 줄(편 제목 "Daebak, Jjang, Heol" 을 쉼표·and 로 나눔) · 한글(텍스트 모델이 제목을 보고 한 번 써 준다, thumbnail.ts) · 뜻(한 줄 요약).
 * 시리즈 공통: 머리글(`thumb_box`, 예 "K-Drama" → "K-DRAMA KOREAN") · 제본 띠 "KOREAN PHRASEBOOK" · 라벨(`thumb_label`, 비면 "PHRASEBOOK SERIES").
 */

const ASSET_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets");
const LOGO_MARK = path.join(ASSET_DIR, "brand/logo-mark.png");
const INK = "#141414";
const ACCENT = "#E0533C";
const BG = "#F4ECDF";
const PAPER = "#FFFDF8";

let fonts: { bold: opentype.Font; heavy: opentype.Font; hand: opentype.Font } | null = null;
const loadFonts = () => (fonts ??= {
  bold: opentype.loadSync(path.join(ASSET_DIR, "fonts/Pretendard-Bold.otf")),
  heavy: opentype.loadSync(path.join(ASSET_DIR, "fonts/Pretendard-ExtraBold.otf")),
  hand: opentype.loadSync(path.join(ASSET_DIR, "fonts/Damion-Regular.ttf")),
});

export interface PhrasebookThumbText {
  /** 표지 큰 글자 — 편이면 표현 로마자(줄마다 하나), 표지면 시리즈 이름을 줄로 나눈 것 */
  lines: string[];
  /** 편: 한글 표기("대박 · 짱 · 헐"). 표지: 무시 */
  hangul: string;
  /** 편: 뜻 한 줄. 표지: 무시 */
  subtitle: string;
  /** 빨간 머리글 — 편 "K-DRAMA KOREAN", 표지 "26 EPISODES" */
  head: string;
  /** 오른쪽 위 라벨 */
  label: string;
  /** 편 번호(1부터) · 표지면 null */
  no: number | null;
  /** 표지 아래 손글씨(비면 "annyeong") */
  handword?: string;
}

/** 편 제목 → 로마자 줄. "Daebak, Jjang, Heol" → 3줄 · "Gomawo and Mianhae" → 2줄 · "Ssi, Nim, A and Ya" → 3줄(마지막은 "A and Ya"). 콜론 뒤 부제는 뗀다. 최대 3줄 — 넘치면 뒤를 합친다 */
export function expressionLines(title: string): string[] {
  const main = title.split(":")[0].trim();
  let parts = main.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) parts = main.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 3) parts = [parts[0], parts[1], parts.slice(2).join(", ")];
  return parts.length ? parts : [main];
}

/** 시리즈 이름 → 표지 줄(단어 단위, 최대 3줄, 줄 길이 균형) */
export function titleLines(name: string, max = 3): string[] {
  const words = name.trim().split(/\s+/);
  if (words.length <= 1) return [name.trim()];
  const n = Math.min(max, words.length);
  const per = Math.ceil(words.length / n);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += per) out.push(words.slice(i, i + per).join(" "));
  return out;
}

export const PHRASEBOOK_TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hangul", "subtitle"],
  properties: {
    hangul: { type: "string", description: "The expressions in Hangul, in the same order, joined with ' · ' (e.g. '대박 · 짱 · 헐'). Standard spelling only." },
    subtitle: { type: "string", description: "What the episode is about in at most 6 English words, no period (e.g. 'Three reactions to anything big')." },
  },
} as const;

export function buildPhrasebookTextPrompt(i: { title: string; oneLiner: string | null; seriesName: string }): string {
  return `Series: ${i.seriesName}
Episode title (romanized Korean expressions): ${i.title}
Episode one-line summary: ${i.oneLiner ?? "(none)"}

Return the Hangul spelling of each expression in the title, in the same order, joined with " · ", and a subtitle of at most six English words describing what the episode is about. Use standard Korean spelling. Do not add expressions that are not in the title.`;
}

function textPath(font: opentype.Font, text: string, x: number, y: number, size: number, tracking = 0): { d: string; advance: number } {
  const p = new opentype.Path();
  let cx = x;
  const glyphs = font.stringToGlyphs(text);
  glyphs.forEach((g, i) => {
    p.extend(g.getPath(cx, y, size));
    const kern = i + 1 < glyphs.length ? font.getKerningValue(g, glyphs[i + 1]) : 0;
    cx += ((g.advanceWidth ?? 0) + kern) * (size / font.unitsPerEm) + (i + 1 < glyphs.length ? tracking * size : 0);
  });
  return { d: p.toPathData(2), advance: cx - x };
}
const width = (font: opentype.Font, text: string, size: number, tracking = 0) => textPath(font, text, 0, 0, size, tracking).advance;
const centered = (font: opentype.Font, text: string, cx: number, y: number, size: number, tracking = 0) => textPath(font, text, cx - width(font, text, size, tracking) / 2, y, size, tracking).d;
const rightAligned = (font: opentype.Font, text: string, rx: number, y: number, size: number, tracking = 0) => textPath(font, text, rx - width(font, text, size, tracking), y, size, tracking).d;
const fitSize = (font: opentype.Font, text: string, maxW: number, size: number, min = 18) => { while (size > min && width(font, text, size) > maxW) size -= 2; return size; };

/** 정사각 PNG. 바탕 그림 없음 */
export async function composePhrasebookThumb(t: PhrasebookThumbText, size = 1024): Promise<Buffer> {
  const { bold, heavy, hand } = loadFonts();
  const S = size;
  const cover = t.no == null;
  const b = { x: S * 0.2, y: S * 0.17, w: S * 0.6, h: S * 0.72, r: S * 0.03 };
  const spineW = S * 0.07;
  const cx = b.x + spineW + (b.w - spineW) / 2;
  const maxW = (b.w - spineW) * 0.84;

  const logoPng = await sharp(LOGO_MARK).resize({ height: Math.round(S * 0.09) }).png().toBuffer();
  const logo = `<image x="${S * 0.056}" y="${S * 0.03}" height="${S * 0.09}" href="data:image/png;base64,${logoPng.toString("base64")}"/>`;
  const label = t.label.trim() ? `<path d="${rightAligned(bold, t.label.trim().toUpperCase(), S * 0.948, S * 0.082, S * 0.032, 0.12)}" fill="${INK}"/>` : "";

  const shadow = `<rect x="${b.x + S * 0.03}" y="${b.y + S * 0.035}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="${INK}" opacity="0.12"/>`;
  const pages = [0.024, 0.012].map((o) => `<rect x="${b.x + S * o}" y="${b.y + S * o}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="${PAPER}" stroke="${INK}" stroke-width="${S * 0.008}"/>`).join("");
  const front = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="#ffffff" stroke="${INK}" stroke-width="${S * 0.011}"/>`;
  const spine = `<rect x="${b.x}" y="${b.y}" width="${spineW}" height="${b.h}" rx="${b.r}" fill="${INK}"/><rect x="${b.x + S * 0.04}" y="${b.y}" width="${S * 0.03}" height="${b.h}" fill="${INK}"/>`;
  const spineText = `<path d="${textPath(bold, "KOREAN PHRASEBOOK", 0, 0, S * 0.026, 0.14).d}" fill="#ffffff" transform="translate(${b.x + S * 0.045} ${b.y + b.h - S * 0.06}) rotate(-90)"/>`;

  // 머리글(빨강) + 빨간 선. 편은 왼쪽 정렬(리본과 안 겹치게), 표지는 가운데
  const head = cover
    ? `<path d="${centered(bold, t.head.toUpperCase(), cx, b.y + S * 0.16, S * 0.034, 0.16)}" fill="${ACCENT}"/>`
    : `<path d="${textPath(bold, t.head.toUpperCase(), cx - maxW / 2, b.y + S * 0.16, fitSize(bold, t.head.toUpperCase(), maxW - S * 0.17, S * 0.024), 0.14).d}" fill="${ACCENT}"/>`;
  const rule = `<line x1="${cx - maxW / 2}" y1="${b.y + S * 0.21}" x2="${cx + maxW / 2}" y2="${b.y + S * 0.21}" stroke="${ACCENT}" stroke-width="${S * 0.006}"/>`;

  // 큰 글자 — 줄마다 같은 크기(가장 긴 줄에 맞춤)
  const lines = t.lines.length ? t.lines : [""];
  const big = Math.min(...lines.map((l) => fitSize(heavy, l, maxW, S * 0.1)));
  const lh = big * 1.08;
  const y0 = b.y + S * 0.27 + big * 0.36;
  const title = lines.map((l, i) => `<path d="${centered(heavy, l, cx, y0 + i * lh, big)}" fill="${INK}"/>`).join("");
  const titleBottom = y0 + lh * (lines.length - 1) + big * 0.1;

  let under = "";
  if (cover) {
    const w = (t.handword ?? "").trim() || "annyeong";
    under = `<path d="${centered(hand, w, cx, b.y + b.h - S * 0.1, fitSize(hand, w, maxW, S * 0.11))}" fill="${INK}"/>`;
  } else {
    const hangul = t.hangul.trim();
    const sub = t.subtitle.trim();
    if (hangul) under += `<path d="${centered(bold, hangul, cx, Math.max(titleBottom + S * 0.08, b.y + b.h - S * 0.13), fitSize(bold, hangul, maxW, S * 0.055))}" fill="${INK}" opacity="0.85"/>`;
    if (sub) under += `<path d="${centered(bold, sub, cx, b.y + b.h - S * 0.055, fitSize(bold, sub, maxW, S * 0.026))}" fill="${INK}" opacity="0.5"/>`;
  }

  // 책갈피 리본 — 편 번호
  const ribbon = cover ? "" : (() => {
    const rx = b.x + b.w - S * 0.15, rw = S * 0.085, rh = S * 0.19;
    const num = String(t.no).padStart(2, "0");
    return `<path d="M ${rx} ${b.y + S * 0.004} h ${rw} v ${rh} l ${-rw / 2} ${-S * 0.032} l ${-rw / 2} ${S * 0.032} Z" fill="${ACCENT}"/><path d="${centered(heavy, num, rx + rw / 2, b.y + S * 0.115, S * 0.052)}" fill="#ffffff"/>`;
  })();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${BG}"/>${logo}${label}${shadow}${pages}${front}${spine}${spineText}${head}${rule}${title}${under}${ribbon}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
