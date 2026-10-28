import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";

/**
 * 코드 합성 시리즈 썸네일 2종 (2026-10-28 박수헌 확정 — 시리즈마다 톤을 다르게 가져가는 원칙, spec/11 7장).
 *   tv    — "광고로 읽는 마케팅": 어두운 바탕의 옛 TV 정지 화면. 화면 안에 편 제목(굵은 한글 디스플레이), 오른쪽 위 채널 번호 = 편 번호. 표지는 채널 자리에 편수.
 *   notes — "사례로 알아보는 창업": 회의실 벽의 포스트잇 세 장. 노랑(제목)·분홍(번호)·민트(시리즈명). 표지는 제목 자리에 시리즈 이름, 번호 자리에 편수.
 * 회화집(thumbnail-phrasebook.ts)과 같은 방식 — 이미지 모델을 부르지 않고 글꼴 윤곽을 SVG 경로로 그려 sharp 로 래스터화한다. 편마다 결과가 흔들리지 않고 비용이 0.
 * 편마다 다른 글자는 설계안(series.plan)의 편 제목이다 — 백로그 제목("시리즈 N — 제목: 부제")이 아니라 짧은 주제 이름.
 */

const ASSET_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets");
const LOGO_MARK = path.join(ASSET_DIR, "brand/logo-mark.png");

let fonts: { bold: opentype.Font; heavy: opentype.Font; display: opentype.Font } | null = null;
const loadFonts = () => (fonts ??= {
  bold: opentype.loadSync(path.join(ASSET_DIR, "fonts/Pretendard-Bold.otf")),
  heavy: opentype.loadSync(path.join(ASSET_DIR, "fonts/Pretendard-ExtraBold.otf")),
  display: opentype.loadSync(path.join(ASSET_DIR, "fonts/BlackHanSans-Regular.ttf")), // OFL — TV 헤드라인용 굵은 한글
});

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

/**
 * 제목을 최대 n줄로 나눈다 — 공백·가운뎃점·쉼표 자리에서, 줄 길이가 고르게. 띄어쓰기가 없는 긴 제목은 글자 수로 반을 가른다.
 * 콜론·대시 뒤 부제는 뗀다("피벗: 버릴 것과 남길 것" → "피벗: 버릴 것과 남길 것" 그대로 두되, "제목 — 부제"의 부제는 뺀다).
 */
export function titleToLines(title: string, max = 2): string[] {
  const main = title.split(/\s[—–-]\s/)[0].trim();
  const words = main.split(/\s+|(?<=[·,])\s*/).map((w) => w.trim()).filter(Boolean);
  if (words.length <= 1) {
    const t = words[0] ?? main;
    if (t.length <= 6 || max === 1) return [t];
    const cut = Math.ceil(t.length / 2);
    return [t.slice(0, cut), t.slice(cut)];
  }
  const n = Math.min(max, words.length);
  // 줄 길이 균형: 글자 수 기준으로 n 줄에 나눠 담는다
  const total = words.join(" ").length;
  const target = total / n;
  const out: string[] = []; let cur: string[] = []; let len = 0;
  for (const w of words) {
    if (cur.length && len + w.length + 1 > target * 1.15 && out.length < n - 1) { out.push(cur.join(" ")); cur = []; len = 0; }
    cur.push(w); len += w.length + 1;
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

/** 시리즈 이름 → 표지 줄(최대 3줄) */
export function nameLines(name: string, max = 3): string[] { return titleToLines(name, max); }

export interface CodeThumbText {
  /** 큰 글자 줄 — 편이면 편 제목을 나눈 것, 표지면 시리즈 이름을 나눈 것 */
  lines: string[];
  /** 편 번호(1부터) · 표지면 null */
  no: number | null;
  /** 표지일 때 편수 */
  total?: number;
  /** 시리즈 이름(편: 작은 글자 자리) */
  seriesName: string;
  /** 간행물 이름(표지: 작은 글자 자리) */
  pubName: string;
  /** 오른쪽 위 라벨 */
  label: string;
}

/** 로고 마크(흰 바탕 PNG)를 잉크 마스크로 — 어두운 획만 불투명하게 해서 어떤 바탕색 위에도 사각 테두리 없이 얹는다. invert=true 면 흰 획 */
async function logoSvg(S: number, invert: boolean): Promise<string> {
  const h = Math.round(S * 0.09);
  const alpha = await sharp(LOGO_MARK).flatten({ background: "#ffffff" }).resize({ height: h }).greyscale().negate().raw().toBuffer({ resolveWithObject: true }); // 획(어두움) → 불투명, 1채널 raw
  const ink = invert ? 255 : 20;
  const png = await sharp({ create: { width: alpha.info.width, height: alpha.info.height, channels: 3, background: { r: ink, g: ink, b: ink } } }).joinChannel(alpha.data, { raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 } }).png().toBuffer();
  return `<image x="${S * 0.056}" y="${S * 0.03}" height="${h}" href="data:image/png;base64,${png.toString("base64")}"/>`;
}

/** TV 정지 화면 — 정사각 PNG */
export async function composeTvThumb(t: CodeThumbText, size = 1024): Promise<Buffer> {
  const { bold, heavy, display } = loadFonts();
  const S = size;
  const cover = t.no == null;
  const BG = "#1E1C1A", BODY = "#2C2926", SCREEN = "#0E0D0C", TEXT = "#FFFFFF", DIM = "#BDB8AE", GREEN = "#7CFF9A", LABEL = "#EDEAE2";
  const logo = await logoSvg(S, true);
  const label = t.label.trim() ? `<path d="${rightAligned(bold, t.label.trim().toUpperCase(), S * 0.948, S * 0.082, S * 0.034, 0.12)}" fill="${LABEL}"/>` : "";
  const tv = { x: S * 0.09, y: S * 0.20, w: S * 0.82, h: S * 0.58, r: S * 0.06 };
  const sc = { x: tv.x + S * 0.05, y: tv.y + S * 0.05, w: tv.w - S * 0.10, h: tv.h - S * 0.10, r: S * 0.04 };
  const body = `<rect x="${tv.x}" y="${tv.y}" width="${tv.w}" height="${tv.h}" rx="${tv.r}" fill="${BODY}"/>`;
  const screen = `<rect x="${sc.x}" y="${sc.y}" width="${sc.w}" height="${sc.h}" rx="${sc.r}" fill="${SCREEN}"/>`;
  // 주사선 — 화면 안에서만(clipPath)
  const scan = `<clipPath id="scr"><rect x="${sc.x}" y="${sc.y}" width="${sc.w}" height="${sc.h}" rx="${sc.r}"/></clipPath><g clip-path="url(#scr)">${Array.from({ length: Math.ceil(sc.h / (S * 0.012)) }, (_, i) => `<rect x="${sc.x}" y="${sc.y + i * S * 0.012}" width="${sc.w}" height="${S * 0.004}" fill="#ffffff" opacity="0.05"/>`).join("")}</g>`;
  const chText = cover ? `전 ${t.total ?? 0}편` : `CH ${String(t.no).padStart(2, "0")}`;
  const ch = `<path d="${rightAligned(heavy, chText, sc.x + sc.w - S * 0.04, sc.y + S * 0.03 + S * 0.045, S * 0.045, 0.08)}" fill="${GREEN}"/>`;
  // 헤드라인 — 줄마다 같은 크기, 화면 가운데
  const lines = t.lines.length ? t.lines : [""];
  const maxW = sc.w * 0.84;
  const big = Math.min(...lines.map((l) => fitSize(display, l, maxW, S * (cover ? 0.085 : 0.095))));
  const lh = big * 1.12;
  const blockH = lh * (lines.length - 1) + big;
  const y0 = sc.y + sc.h / 2 - blockH / 2 + big * 0.82;
  const head = lines.map((l, i) => `<path d="${centered(display, l, sc.x + sc.w / 2, y0 + i * lh, big)}" fill="${TEXT}"/>`).join("");
  const small = cover ? t.pubName : t.seriesName;
  const pub = `<path d="${textPath(bold, small, S * 0.12, S * 0.905, fitSize(bold, small, S * 0.55, S * 0.032), 0.12).d}" fill="${DIM}"/>`;
  const knob = `<circle cx="${S - S * 0.16}" cy="${S * 0.88}" r="${S * 0.03}" fill="none" stroke="${DIM}" stroke-width="${S * 0.01}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${BG}"/>${logo}${label}${body}${screen}${scan}${ch}${head}${pub}${knob}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** 포스트잇 벽 — 정사각 PNG. 기울기는 편 번호로 조금씩 다르게 */
export async function composeNotesThumb(t: CodeThumbText, size = 1024): Promise<Buffer> {
  const { bold, heavy } = loadFonts();
  const S = size;
  const cover = t.no == null;
  const BG = "#D6DCE0", INK = "#101010", YELLOW = "#FFD83D", PINK = "#FF8A8A", MINT = "#7FD9B4", LABEL = "#141414";
  const wob = cover ? 0 : (((t.no ?? 0) % 3) - 1) * 0.8; // -0.8 · 0 · +0.8도
  const logo = await logoSvg(S, false);
  const label = t.label.trim() ? `<path d="${rightAligned(bold, t.label.trim().toUpperCase(), S * 0.948, S * 0.082, S * 0.034, 0.12)}" fill="${LABEL}"/>` : "";
  const note = (x: number, y: number, w: number, h: number, deg: number, fill: string, inner: string, tape = true) => {
    const cx = x + w / 2, cy = y + h / 2;
    const tapeEl = tape ? `<rect x="${cx - S * 0.05}" y="${y - S * 0.016}" width="${S * 0.10}" height="${S * 0.032}" fill="#ffffff" opacity="0.75" transform="rotate(-6 ${cx} ${y})"/>` : "";
    return `<g transform="rotate(${deg} ${cx} ${cy})"><rect x="${x + S * 0.012}" y="${y + S * 0.018}" width="${w}" height="${h}" fill="#000000" opacity="0.14"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>${inner}${tapeEl}</g>`;
  };
  // 노랑 — 제목(또는 시리즈 이름)
  const n1 = { x: S * 0.08, y: S * 0.18, w: S * 0.42, h: S * 0.42 };
  const lines = t.lines.length ? t.lines : [""];
  const maxW = n1.w * 0.78;
  const longest = Math.max(...lines.map((l) => l.length));
  const big = Math.min(...lines.map((l) => fitSize(heavy, l, maxW, S * (longest <= 3 && lines.length === 1 ? 0.1 : 0.064)))); // 한두 글자 제목("피벗")은 크게
  const lh = big * 1.2;
  const blockH = lh * (lines.length - 1) + big;
  const y0 = n1.y + n1.h / 2 - blockH / 2 + big * 0.82;
  const title = lines.map((l, i) => `<path d="${centered(heavy, l, n1.x + n1.w / 2, y0 + i * lh, big)}" fill="${INK}"/>`).join("");
  const note1 = note(n1.x, n1.y, n1.w, n1.h, -4 + wob, YELLOW, title);
  // 분홍 — 번호(또는 편수)
  const n2 = { x: S - S * 0.08 - S * 0.32, y: S * 0.24, w: S * 0.32, h: S * 0.32 };
  const numText = cover ? String(t.total ?? "") : String(t.no).padStart(2, "0");
  const numSize = fitSize(heavy, numText, n2.w * 0.8, S * 0.12);
  const num = `<path d="${centered(heavy, numText, n2.x + n2.w / 2, n2.y + n2.h / 2 + numSize * 0.36, numSize)}" fill="${INK}"/>`;
  const note2 = note(n2.x, n2.y, n2.w, n2.h, 3 - wob, PINK, num);
  // 민트 — 시리즈 이름(또는 간행물 · 전 N편)
  const n3 = { x: S * 0.26, y: S - S * 0.08 - S * 0.20, w: S * 0.44, h: S * 0.20 };
  const small = cover ? `${t.pubName} · 전 ${t.total ?? 0}편` : t.seriesName;
  const smSize = fitSize(bold, small, n3.w * 0.86, S * 0.038);
  const sm = `<path d="${centered(bold, small, n3.x + n3.w / 2, n3.y + n3.h / 2 + smSize * 0.36, smSize, 0.06)}" fill="${INK}"/>`;
  const note3 = note(n3.x, n3.y, n3.w, n3.h, 2 + wob / 2, MINT, sm, false);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${BG}"/>${logo}${label}${note3}${note1}${note2}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export const CODE_STYLE_LABEL: Record<"tv" | "notes", { name: string; defaultLabel: string }> = {
  tv: { name: "TV 정지 화면", defaultLabel: "AD SERIES" },
  notes: { name: "포스트잇 벽", defaultLabel: "CASE SERIES" },
};

