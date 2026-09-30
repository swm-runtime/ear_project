/**
 * 히어로 앱 목업에 들어갈 사진(콘텐츠 커버·주제 칩 배경)을 `public/preview/`에 굽는다.
 *
 * 산출물은 커밋되므로 빌드에 끼우지 않는다. 사진을 바꾸고 싶을 때만 손으로 돌린다:
 *   node scripts/preview-art.mjs            # 전부
 *   node scripts/preview-art.mjs covers     # 커버만(picsum에서 내려받는다)
 *   node scripts/preview-art.mjs topics     # 주제 칩 배경만(네트워크 없이 frontend/assets에서)
 *
 * 출처를 앱과 맞춘다 — 앱 시드가 `picsum.photos/seed/ear-<N>`를 콘텐츠 썸네일로 쓰므로
 * (backend/src/database/seeds/seed-mock-onboarding.ts) 같은 seed 값을 그대로 가져온다.
 * 목업이 실제 앱에서 보이는 그 사진을 보여주게 된다.
 *
 * 다만 **런타임에 물어오지 않고 받아서 커밋한다.** 정적 페이지가 서드파티 응답에 묶이면
 * 그 서버가 느린 만큼 첫 화면이 늦어지고, 내려가 있으면 목업이 빈 사각형이 된다.
 */
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/preview");

/**
 * 목업 카드 순서대로 배정할 seed 값. 앱 시드가 쓰는 `ear-<N>` 풀에서 고르되,
 * 그중 주제에 맞는 것만 추렸다 — 랜덤으로 집으면 꽃·음식 같은 사진이 걸려
 * 커리어·생산성 콘텐츠 목록에 얹혔을 때 첫인상이 어긋난다.
 *   ear-4  책상 위 노트와 노트북    ear-1  헤드폰·기기 플랫레이
 *   ear-2  통근 중인 버스 안        ear-9  야간 도로의 광선
 *   ear-13 여러 잔이 놓인 카페 테이블
 */
const SEEDS = ["ear-4", "ear-1", "ear-2", "ear-9", "ear-13"];

/** 화면에서 가장 큰 커버(플레이어 아트워크)가 253px이다. 420px면 고해상도 화면에서도 무르지 않다. */
const SIZE = 420;
/** 원본은 훨씬 크게 받아 축소한다 — 축소하면 압축 노이즈가 눈에 덜 띈다. */
const FETCH_SIZE = 800;

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
  for (const [i, seed] of SEEDS.entries()) {
    const url = `https://picsum.photos/seed/${seed}/${FETCH_SIZE}/${FETCH_SIZE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${seed}: ${res.status} ${res.statusText}`);

    const webp = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(SIZE, SIZE, { fit: "cover" })
      .webp({ quality: 78 })
      .toBuffer();

    const file = `cover-${i + 1}.webp`;
    await writeFile(join(outDir, file), webp);
    console.log(`cover  public/preview/${file}  ${SIZE}×${SIZE}  ${(webp.byteLength / 1024) | 0}KB  ← ${seed}`);
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
