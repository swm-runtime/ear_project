/**
 * 히어로 앱 목업에 들어갈 사진(콘텐츠 커버·주제 칩 배경)을 `public/preview/`에 굽는다.
 *
 * 산출물은 커밋되므로 빌드에 끼우지 않는다. 사진을 바꾸고 싶을 때만 손으로 돌린다:
 *   node scripts/preview-art.mjs            # 전부
 *   node scripts/preview-art.mjs covers     # 커버만(운영 CDN의 실제 썸네일을 내려받는다)
 *   node scripts/preview-art.mjs topics     # 주제 칩 배경만(네트워크 없이 frontend/assets에서)
 *
 * 커버는 **운영에 발행된 실제 콘텐츠의 썸네일**이다(2026-09-30 — 종전에는 앱 시드의 picsum 사진이었다).
 * `thumb/*`는 CloudFront에서 서명 없이 공개되는 경로라(docs/infra/architecture.md 3.3) 그대로 받는다.
 * 목업의 제목·길이(Hero.tsx의 POPULAR·RECOMMENDED)와 **같은 순서**로 적는다 — 어긋나면 남의 커버가 붙는다.
 *
 * 다만 **런타임에 물어오지 않고 받아서 커밋한다.** 정적 페이지가 CDN 응답에 묶이면 그 응답이 느린 만큼
 * 첫 화면이 늦어지고, 콘텐츠가 회수돼 썸네일이 지워지면 목업이 빈 사각형이 된다.
 */
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/preview");

/**
 * 목업 카드 순서대로의 실제 썸네일(운영 `contents.thumbnail_url`). Hero.tsx의 POPULAR 2편 → RECOMMENDED 3편 순서다.
 *   1 뱅크런은 원인이 아니라 결과다            2 일이 잘 안될 때 더 집중하면 안 되는 이유
 *   3 월급이 끊겨도 흔들리지 않는 구조 …       4 말이 막혀도 생각은 돌아간다 …
 *   5 알고도 몸이 움직이지 않는 이유
 * 콘텐츠를 바꾸려면 여기 URL과 Hero.tsx의 제목·길이·주제를 **함께** 바꾼다.
 */
const THUMB_BASE = "https://dp04jswjfphd3.cloudfront.net/thumb";
const COVERS = [
  "9298ee61da4857194ae184a5134da3c0.webp",
  "c02e888855aec62b220d65d63c230d4f.webp",
  "64934dd28966315af3b8df882bb9cf34.webp",
  "96439843f19c63d7b137e24408f992c9.png",
  "c5904ce7b4879adbcc26be812a05bfd8.webp",
];

/** 화면에서 가장 큰 커버(플레이어 아트워크)가 253px이다. 420px면 고해상도 화면에서도 무르지 않다. */
const SIZE = 420;

/**
 * 주제 칩의 배경 사진 — 앱이 번들에 넣어 쓰는 그 사진이다(frontend/assets/topics, 전부 CC0 —
 * frontend/src/features/interest/components/TopicChip.tsx). 목업의 칩 순서대로 적는다.
 * 키는 Hero.tsx의 TOPICS가 쓰는 파일 이름이다.
 */
const TOPIC_PHOTOS = ["productivity", "data-ai", "psychology", "communication"];
const topicSrcDir = join(root, "../frontend/assets/topics");
/** 칩은 화면에서 높이 32px 남짓이다. 원본 비율(800×320) 그대로 3배쯤만 남긴다. */
const TOPIC_W = 240;
const TOPIC_H = 96;

/** 인자가 없으면 전부, 있으면 그 묶음만 굽는다 */
const only = process.argv[2];
await mkdir(outDir, { recursive: true });

if (!only || only === "covers") {
  for (const [i, name] of COVERS.entries()) {
    const url = `${THUMB_BASE}/${name}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText}`);

    const webp = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(SIZE, SIZE, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();

    const file = `cover-${i + 1}.webp`;
    await writeFile(join(outDir, file), webp);
    console.log(`cover  public/preview/${file}  ${SIZE}×${SIZE}  ${(webp.byteLength / 1024) | 0}KB  ← thumb/${name}`);
  }
}

if (!only || only === "topics") {
  for (const name of TOPIC_PHOTOS) {
    const webp = await sharp(join(topicSrcDir, `topic-${name}.jpg`))
      .resize(TOPIC_W, TOPIC_H, { fit: "cover" })
      .webp({ quality: 72 })
      .toBuffer();

    const file = `topic-${name}.webp`;
    await writeFile(join(outDir, file), webp);
    console.log(`topic  public/preview/${file}  ${TOPIC_W}×${TOPIC_H}  ${(webp.byteLength / 1024) | 0}KB`);
  }
}
