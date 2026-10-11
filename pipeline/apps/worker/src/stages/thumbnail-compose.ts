import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * 썸네일 코너 삼각형 합성 (KAN-138 thumb-v4, 2026-10-07).
 *
 * v1~v3 은 모델이 삼각형을 그렸고, 편마다 모양·크기·위치가 흔들렸다(사선 띠가 리본으로 나오거나 둥근 모서리가 그려짐 — thumb-v2·v3 개정 이력).
 * v4 부터 모델은 삼각형 없이 그림만 그리고, 여기서 정해진 크기·색·그림자로 얹는다.
 *
 * 확정안(박수헌 2026-10-07): 오른쪽 위 직각삼각형, 두 변은 한 변의 30% · 대분류 색 · 흰 경계선 없음 ·
 * 빗변 바깥에 검은 그림자 S2 — 28px@1024 폭, 빗변에서 20% 에서 바깥으로 제곱 감쇠("표지 아래 검은 그림자가 있는 듯 없는 듯").
 * 시안 비교: pipeline/.work/thumb-test/batch10/soft.html (흰 선·그라데이션 약/강·S1~S3)
 */
export const CORNER_LEG = 0.30;
export const SHADOW_WIDTH = 28 / 1024; // 한 변 대비
export const SHADOW_ALPHA = 0.20;

const run = promisify(execFile);
async function ffmpeg(args: string[], opts: { stdout?: boolean } = {}): Promise<Buffer> {
  try {
    const r = await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "buffer", maxBuffer: 64 << 20 });
    return opts.stdout ? (r.stdout as Buffer) : Buffer.alloc(0);
  } catch (e: any) {
    if (e.code === "ENOENT") throw new Error("ffmpeg 가 없습니다 — 서버 이미지에는 포함, 로컬은 brew install ffmpeg");
    throw new Error(`ffmpeg 실패: ${String(e.stderr || e.message || "").slice(0, 500)}`);
  }
}

/** "딥 그린 (#2F6B4F)"·"#2F6B4F" 에서 RGB — 설정에 HEX 가 없으면 무채색 */
export function bandRgb(band: string): [number, number, number] {
  const m = band.match(/#([0-9a-f]{6})/i);
  const hex = m ? m[1] : "6E6E76";
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * ffmpeg 필터 — 2배로 키워 그린 뒤 줄여 빗변 경계를 매끄럽게 한다.
 * d = 빗변까지 거리(삼각형 안쪽이 양수). d ≥ 0 → 대분류 색, d < 0 → 원본 × (1 − 0.2·(1 − |d|/폭)²), 폭 밖은 원본.
 */
export function cornerFilter(rgb: [number, number, number]): string {
  const d = `st(0,(X-Y-${(1 - CORNER_LEG).toFixed(4)}*W)/1.41421356)`;
  const shade = (ch: string) => `${ch}(X,Y)*(1-${SHADOW_ALPHA}*pow(max(0,1+ld(0)/(${SHADOW_WIDTH.toFixed(6)}*W)),2))`;
  const ch = (name: string, v: number) => `${name}='${d};if(gte(ld(0),0),${v},${shade(name)})'`;
  return `scale=iw*2:ih*2,format=rgb24,geq=${ch("r", rgb[0])}:${ch("g", rgb[1])}:${ch("b", rgb[2])},scale=iw/2:ih/2:flags=lanczos`;
}

export async function composeCorner(inFile: string, outFile: string, band: string): Promise<void> {
  await ffmpeg(["-i", inFile, "-vf", cornerFilter(bandRgb(band)), outFile]);
}

// ── 대비 측정 — 빗변 바로 바깥 배경과 삼각형 색의 차이(ΔE76 중앙값). 20 미만이면 맞닿은 경계가 흐릿하다(시안 실측) ──
function toLab([r, g, b]: number[]): [number, number, number] {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
export function deltaE(a: number[], b: number[]): number {
  const [l1, a1, b1] = toLab(a), [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
/** raw rgb24 정사각 이미지(한 변 n)에서 빗변 바깥 band 폭(한 변 대비) 띠의 ΔE 중앙값 */
export function cornerContrastOf(raw: Buffer, n: number, band: string, strip = 40 / 1024): number {
  const rgb = bandRgb(band); const des: number[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = (x + 0.5 - (y + 0.5) - (1 - CORNER_LEG) * n) / Math.SQRT2;
    if (d < 0 && d >= -strip * n) { const i = (y * n + x) * 3; des.push(deltaE([raw[i], raw[i + 1], raw[i + 2]], rgb)); }
  }
  if (!des.length) return 0;
  des.sort((p, q) => p - q);
  return Math.round(des[Math.floor(des.length / 2)] * 10) / 10;
}
/** 원본(삼각형 얹기 전) 파일의 코너 대비 — 256px 로 줄여 잰다 */
export async function cornerContrast(rawFile: string, band: string): Promise<number> {
  const n = 256;
  const raw = await ffmpeg(["-i", rawFile, "-vf", `scale=${n}:${n}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { stdout: true });
  return cornerContrastOf(raw, n, band);
}
