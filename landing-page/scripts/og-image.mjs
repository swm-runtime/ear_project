/**
 * 공유 링크 미리보기 이미지(og:image)를 public/opengraph-image.png 로 굽는다.
 *
 * `next build` 앞에 자동으로 돌아간다(package.json의 prebuild).
 *
 * app/opengraph-image.tsx 라우트 규약을 쓰지 않고 굳이 정적 파일로 만드는 이유:
 * 그 규약은 확장자 없는 /opengraph-image 경로로 나가는데, 정적 호스팅 대부분은
 * 확장자로 Content-Type을 정하므로 application/octet-stream이 되어버린다.
 * 카카오톡·페이스북 크롤러는 그런 응답을 이미지로 받아들이지 않아 썸네일이 비고,
 * 이건 정확히 이 페이지가 막으려던 실패다.
 *
 * 문구를 고쳤다면 assets/og-*.ttf 서브셋도 다시 만들어야 한다(assets/README.md).
 */
// Next 밖에서 도는 스크립트라 번들러의 확장자 보정을 받지 못한다. 실제 파일명을 그대로 쓴다.
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const INK = "#0C0F1A";
const AMBER = "#F2AB55";
const AMBER_LIGHT = "#FFC98A";

const bold = await readFile(join(root, "assets/og-800.ttf"));
const regular = await readFile(join(root, "assets/og-400.ttf"));

/** satori는 자식이 여럿인 노드에 display:flex를 요구한다. 모든 div에 기본으로 넣는다. */
const div = (style, children) =>
  h("div", { style: { display: "flex", ...style } }, children);

const logo = h(
  "svg",
  { width: 54, height: 54, viewBox: "0 0 32 32", fill: "none" },
  [
    h("circle", {
      key: "c",
      cx: 10.5,
      cy: 16,
      r: 5.4,
      stroke: AMBER,
      strokeWidth: 2.7,
    }),
    h("path", {
      key: "a1",
      d: "M20.5 10.6a8.6 8.6 0 0 1 0 10.8",
      stroke: AMBER,
      strokeWidth: 2.7,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "a2",
      d: "M26 6.4a15.2 15.2 0 0 1 0 19.2",
      stroke: AMBER,
      strokeWidth: 2.7,
      strokeLinecap: "round",
    }),
  ]
);

const headline = {
  fontSize: 74,
  fontWeight: 800,
  lineHeight: 1.28,
  letterSpacing: "-0.045em",
};

const tree = div(
  {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "76px 84px",
    background: INK,
    fontFamily: "Pretendard",
    position: "relative",
  },
  [
    // 왼쪽 아래에서 번지는 새벽빛
    div({
      key: "glow",
      position: "absolute",
      left: -180,
      bottom: -260,
      width: 900,
      height: 900,
      borderRadius: 999,
      background:
        "radial-gradient(circle, rgba(226,147,56,0.40) 0%, rgba(226,147,56,0.10) 45%, rgba(12,15,26,0) 70%)",
    }),

    div({ key: "brand", alignItems: "center", gap: 20 }, [
      h("div", { key: "mark", style: { display: "flex" } }, logo),
      div(
        {
          key: "name",
          fontSize: 46,
          fontWeight: 800,
          letterSpacing: "-0.05em",
          color: "#FFFFFF",
        },
        "이어"
      ),
    ]),

    div({ key: "copy", flexDirection: "column" }, [
      div({ key: "l1", ...headline, color: "#F7F8FB" }, "출근길에 열면,"),
      div(
        { key: "l2", ...headline, color: AMBER_LIGHT },
        "오늘 들을 게 준비되어 있어요"
      ),
    ]),

    div(
      {
        key: "foot",
        alignItems: "center",
        gap: 16,
        fontSize: 27,
        fontWeight: 400,
        color: "#949AB3",
      },
      [
        div({ key: "a" }, "자기계발 · 커리어 · 교양"),
        div({ key: "b", color: "#2B3145" }, "|"),
        div({ key: "c" }, "매일 2편, 오디오로 도착하는 AI 팟캐스트"),
      ]
    ),
  ]
);

const png = await new ImageResponse(tree, {
  width: 1200,
  height: 630,
  fonts: [
    { name: "Pretendard", data: bold, weight: 800, style: "normal" },
    { name: "Pretendard", data: regular, weight: 400, style: "normal" },
  ],
}).arrayBuffer();

const out = join(root, "public/opengraph-image.png");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.from(png));

console.log(`og image → public/opengraph-image.png (${(png.byteLength / 1024) | 0}KB)`);
