/**
 * 공유 링크 미리보기 이미지(og:image)를 public/og/*.png 로 굽는다.
 *
 * `next build` 앞에 자동으로 돌아간다(package.json의 prebuild).
 *
 * app/opengraph-image.tsx 라우트 규약을 쓰지 않고 굳이 정적 파일로 만드는 이유:
 * 그 규약은 확장자 없는 /opengraph-image 경로로 나가는데, 정적 호스팅 대부분은
 * 확장자로 Content-Type을 정하므로 application/octet-stream이 되어버린다.
 * 카카오톡·페이스북 크롤러는 그런 응답을 이미지로 받아들이지 않아 썸네일이 비고,
 * 이건 정확히 이 페이지가 막으려던 실패다.
 *
 * 문구는 `scripts/og-pages.mjs`에 있고, 고쳤다면 `bash scripts/subset-og-fonts.sh`로
 * assets/og-*.ttf 서브셋도 다시 만들어야 한다.
 */
// Next 밖에서 도는 스크립트라 번들러의 확장자 보정을 받지 못한다. 실제 파일명을 그대로 쓴다.
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OG_PAGES } from "./og-pages.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const INK = "#0C0F1A";
const AMBER = "#F2AB55";
const AMBER_LIGHT = "#FFC98A";
const MUTED = "#949AB3";

const bold = await readFile(join(root, "assets/og-800.ttf"));
const regular = await readFile(join(root, "assets/og-400.ttf"));

/** satori는 자식이 여럿인 노드에 display:flex를 요구한다. 모든 div에 기본으로 넣는다. */
const div = (style, children) =>
  h("div", { style: { display: "flex", ...style } }, children);

const logo = h(
  "svg",
  { width: 54, height: 54, viewBox: "0 0 32 32", fill: "none" },
  [
    h("circle", { key: "c", cx: 10.5, cy: 16, r: 5.4, stroke: AMBER, strokeWidth: 2.7 }),
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

/** 두 줄 제목의 글자 크기. 긴 줄이 1200px를 넘지 않도록 글자 수로 눈금을 준다. */
function headlineSize(page) {
  const longest = Math.max(page.line1.length, page.line2.length);
  if (longest <= 10) return 82;
  if (longest <= 14) return 74;
  return 66;
}

function tree(page) {
  const size = headlineSize(page);
  const headline = {
    fontSize: size,
    fontWeight: 800,
    lineHeight: 1.28,
    letterSpacing: "-0.045em",
  };

  const brandRow = [
    h("div", { key: "mark", style: { display: "flex" } }, logo),
    div(
      { key: "name", fontSize: 46, fontWeight: 800, letterSpacing: "-0.05em", color: "#FFFFFF" },
      "이어"
    ),
  ];

  // 하위 페이지는 워드마크 옆에 어느 페이지인지 붙인다. 홈에는 붙이지 않는다.
  if (page.eyebrow) {
    brandRow.push(
      div(
        {
          key: "eyebrow",
          marginLeft: 6,
          padding: "8px 20px",
          borderRadius: 999,
          border: `1px solid rgba(255,201,138,0.32)`,
          background: "rgba(226,147,56,0.12)",
          color: AMBER_LIGHT,
          fontSize: 25,
          fontWeight: 400,
        },
        page.eyebrow
      )
    );
  }

  const foot = [];
  page.foot.forEach((text, i) => {
    if (i > 0) foot.push(div({ key: `sep${i}`, color: "#2B3145" }, "|"));
    foot.push(div({ key: `f${i}` }, text));
  });

  return div(
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

      div({ key: "brand", alignItems: "center", gap: 20 }, brandRow),

      div({ key: "copy", flexDirection: "column" }, [
        div({ key: "l1", ...headline, color: "#F7F8FB" }, page.line1),
        div({ key: "l2", ...headline, color: AMBER_LIGHT }, page.line2),
      ]),

      div(
        { key: "foot", alignItems: "center", gap: 16, fontSize: 27, fontWeight: 400, color: MUTED },
        foot
      ),
    ]
  );
}

const outDir = join(root, "public/og");
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const page of OG_PAGES) {
  const png = await new ImageResponse(tree(page), {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Pretendard", data: bold, weight: 800, style: "normal" },
      { name: "Pretendard", data: regular, weight: 400, style: "normal" },
    ],
  }).arrayBuffer();

  await writeFile(join(outDir, page.file), Buffer.from(png));
  console.log(`og  public/og/${page.file}  ${(png.byteLength / 1024) | 0}KB`);
}
