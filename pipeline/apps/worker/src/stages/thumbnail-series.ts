import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";

/**
 * 시리즈 썸네일 합성 (KAN-136, 2026-10-20 — 팀원 레퍼런스 "이어 · KEYWORD SERIES · keyword · 경제편 · 01").
 *
 * 시리즈의 모든 편은 **같은 바탕 그림**(이미지 모델이 시리즈당 한 번 — 아이콘 셋 + 손글씨 큰 단어)을 쓰고, 글자는 여기서 얹는다:
 * 왼쪽 위 로고 · 오른쪽 위 라벨 · 왼쪽 아래 박스 · 편 번호(왼쪽 아래 "01"). 이미지 모델은 한글이 깨지고 편마다 글자 자리가 흔들려서
 * 코너 삼각형(thumbnail-compose.ts)과 같은 이유로 코드가 얹는다.
 *
 * 표지(제품 시리즈 표지)는 같은 바탕에 번호 대신 편수("전 16편")를 **라벨 아래 오른쪽 위**에 둔다(A′안, 박수헌 2026-10-20) —
 * 앱 시리즈 카드가 표지 아래 변을 "시리즈" 표식으로 덮어서(KAN-225 결정 2) 왼쪽 아래 번호 자리는 가려진다.
 * 자리 값은 1254px 레퍼런스에서 잰 비율이다(목업 scratchpad series-thumb/mock.html 과 같은 값).
 */

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
const FONT_BOLD = path.join(FONT_DIR, "Pretendard-Bold.otf");
const FONT_HEAVY = path.join(FONT_DIR, "Pretendard-ExtraBold.otf");
const INK = "#111111";

/** 한 변 대비 비율 — 레퍼런스 실측 */
export const SERIES_LAYOUT = {
  margin: 0.056,          // 로고·번호 왼쪽 여백
  logoTop: 0.046, logoSize: 0.068,
  labelRight: 0.052, labelTop: 0.06, labelSize: 0.032, labelTracking: 0.12,
  countTop: 0.105, countSize: 0.056,
  box: { left: 0.074, top: 0.658, width: 0.424, height: 0.196, radius: 0.013, size: 0.14 },
  noBottom: 0.044, noSize: 0.066,
} as const;

export interface SeriesThumbText {
  /** 왼쪽 위 로고 — 한국판 "이어", 글로벌판 "Earcast" */
  logo: string;
  /** 오른쪽 위 라벨(thumb_label) */
  label: string;
  /** 왼쪽 아래 박스(thumb_box) — 비면 박스를 그리지 않는다 */
  box: string;
  /** 편이면 번호(1부터), 표지면 null */
  no: number | null;
  /** 표지 편수 글자 — "전 16편" / "16 EPISODES". 편이면 무시 */
  count?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** pango 글자 한 덩어리를 투명 PNG 로 — 크기는 px 높이 기준(dpi 72 에서 pt = px) */
async function textLayer(text: string, px: number, opts: { heavy?: boolean; color?: string; tracking?: number } = {}): Promise<{ buf: Buffer; width: number; height: number }> {
  const spacing = opts.tracking ? ` letter_spacing="${Math.round(opts.tracking * px * 1024)}"` : "";
  const img = sharp({
    text: {
      text: `<span foreground="${opts.color ?? INK}"${spacing}>${esc(text)}</span>`,
      font: `Pretendard ${opts.heavy ? "ExtraBold" : "Bold"} ${Math.round(px)}`,
      fontfile: opts.heavy ? FONT_HEAVY : FONT_BOLD,
      dpi: 72, rgba: true,
    },
  });
  const buf = await img.png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, width: m.width ?? 0, height: m.height ?? 0 };
}

/** 바탕 그림 + 글자 → 정사각 PNG. 바탕은 size 로 맞춘다(모델 출력이 1024 가 아니어도 같은 비율로 얹는다) */
export async function composeSeriesThumb(base: Buffer, t: SeriesThumbText, size = 1024): Promise<Buffer> {
  const L = SERIES_LAYOUT;
  const at = (v: number) => Math.round(v * size);
  const layers: OverlayOptions[] = [];

  const logo = await textLayer(t.logo, at(L.logoSize), { heavy: true });
  layers.push({ input: logo.buf, left: at(L.margin), top: at(L.logoTop) });

  if (t.label.trim()) {
    const label = await textLayer(t.label.trim().toUpperCase(), at(L.labelSize), { tracking: L.labelTracking });
    layers.push({ input: label.buf, left: Math.max(0, size - at(L.labelRight) - label.width), top: at(L.labelTop) });
  }

  if (t.box.trim()) {
    const b = L.box;
    const w = at(b.width), h = at(b.height);
    let txt = await textLayer(t.box.trim(), at(b.size), { heavy: true, color: "#FFFFFF" });
    // 글자가 박스보다 길면 줄여서 다시 — 영어 박스("ECONOMY")는 한글보다 넓다
    if (txt.width > w * 0.86) txt = await textLayer(t.box.trim(), at(b.size) * (w * 0.86) / txt.width, { heavy: true, color: "#FFFFFF" });
    const rect = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${at(b.radius)}" fill="${INK}"/></svg>`);
    layers.push({ input: rect, left: at(b.left), top: at(b.top) });
    layers.push({ input: txt.buf, left: at(b.left) + Math.round((w - txt.width) / 2), top: at(b.top) + Math.round((h - txt.height) / 2) });
  }

  if (t.no != null) {
    const no = await textLayer(String(t.no).padStart(2, "0"), at(L.noSize));
    layers.push({ input: no.buf, left: at(L.margin), top: size - at(L.noBottom) - no.height });
  } else if (t.count?.trim()) {
    const c = await textLayer(t.count.trim(), at(L.countSize), { heavy: true });
    layers.push({ input: c.buf, left: Math.max(0, size - at(L.labelRight) - c.width), top: at(L.countTop) });
  }

  return sharp(base).resize(size, size, { fit: "cover" }).composite(layers).png().toBuffer();
}

/** 표지 편수 글자 — 한국판 "전 N편", 글로벌판 "N EPISODES" */
export const seriesCountText = (total: number, en: boolean) => (en ? `${total} EPISODES` : `전 ${total}편`);
/** 로고 — 한국판 앱 이름 "이어", 글로벌판 "Earcast"(글로벌 인트로 템플릿의 쇼 이름) */
export const seriesLogo = (en: boolean) => (en ? "Earcast" : "이어");
