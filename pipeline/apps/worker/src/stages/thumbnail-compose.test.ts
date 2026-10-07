import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
process.env.DATABASE_URL ??= "postgres://test";
const { bandRgb, composeCorner, cornerContrast, cornerFilter, deltaE, CORNER_LEG } = await import("./thumbnail-compose.js");

// KAN-138 thumb-v4 (2026-10-07) — 코너 삼각형(변 30%)·S2 그림자(28px·20%)를 코드가 얹는다
const run = promisify(execFile);
const rgbAt = async (file: string, n: number) => (await run("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer", maxBuffer: 16 << 20 })).stdout as Buffer;
const px = (raw: Buffer, n: number, x: number, y: number) => { const i = (y * n + x) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };

test("bandRgb — 이름(HEX) 문자열에서 색을 읽고, HEX 가 없으면 무채색", () => {
  assert.deepEqual(bandRgb("딥 그린 (#2F6B4F)"), [0x2f, 0x6b, 0x4f]);
  assert.deepEqual(bandRgb("슬레이트 그레이"), [0x6e, 0x6e, 0x76]);
});

test("deltaE — 같은 색은 0, 흰색과 검정은 약 100", () => {
  assert.equal(deltaE([10, 20, 30], [10, 20, 30]), 0);
  assert.ok(Math.abs(deltaE([255, 255, 255], [0, 0, 0]) - 100) < 0.5);
});

test("cornerFilter — 삼각형 색이 채널마다 들어간다", () => {
  const f = cornerFilter([47, 107, 79]);
  assert.match(f, /r='[^']*,47,/); assert.match(f, /g='[^']*,107,/); assert.match(f, /b='[^']*,79,/);
});

test("composeCorner — 삼각형 안은 대분류 색, 빗변 바로 바깥은 살짝 어둡고, 먼 곳은 그대로", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "thumb-")); const n = 1024;
  const src = path.join(dir, "src.png"), out = path.join(dir, "out.png");
  await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=0x808080:s=${n}x${n}`, "-frames:v", "1", src]);
  await composeCorner(src, out, "딥 그린 (#2F6B4F)");
  const raw = await rgbAt(out, n);
  const inside = px(raw, n, n - 10, 10);
  assert.ok(deltaE(inside, [0x2f, 0x6b, 0x4f]) < 3, `삼각형 안 ${inside}`);
  // 빗변 바깥 4px 쯤 (빗변: x - y = 0.7n) — 원본 128 보다 어둡되 검게 뭉개지지 않는다
  const edge = Math.round((1 - CORNER_LEG) * n);
  const near = px(raw, n, edge + 200 - 6, 200);
  assert.ok(near[0] < 124 && near[0] > 95, `빗변 바깥 ${near}`);
  assert.deepEqual(px(raw, n, 100, 900), [128, 128, 128]);
  // 원본 대비 — 회색과 딥 그린
  assert.ok((await cornerContrast(src, "#2F6B4F")) > 20);
});
