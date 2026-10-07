import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { getBacklog, getEpisode, getSetting, insertRun, majorOfMidTopic, pool, setJobProgress, type Job } from "../db.js";
import { promptBody } from "@ear/pipeline";
import { THUMBNAIL_ANCHOR_PROMPT_KEY, THUMBNAIL_PROMPT_KEY, THUMBNAIL_SCENE_PROMPT_KEY, workerRev } from "../assets.js";
import { makeExecutor } from "../executors/index.js";
import { composeCorner, cornerContrast } from "./thumbnail-compose.js";
import { buildScenePrompt, recentScenes, SCENE_FILE, SCENE_SCHEMA, type ThumbnailScene } from "./thumbnail-scene.js";
import { advanceChain } from "../chain.js";
import { exists, localPathOf, pullPrefix, pushPrefix, s3Key } from "../storage.js";
import { log } from "../util.js";

/**
 * 썸네일 생성 단계 (KAN-50) — OpenAI 이미지 API 로 1024×1024 PNG 1장.
 *
 * 지금까지 썸네일은 **파이프라인 밖에서** 만들었다: 운영자가 ChatGPT 웹에 정해진 프롬프트를 주고
 * 받은 이미지를 업로드 화면에 파일로 올렸다. 월 100편 목표에서 그 왕복이 병목이라 단계로 들여온다.
 *
 * 프롬프트의 진실은 DB(prompt_assets `skills/thumbnail/prompt.md`)다 — spec/10 3.2 와 같은 규칙.
 * 워커는 슬롯 4개만 채운다: {제목} · {주제 분류} · {핵심 개념} · {띠 색}.
 *
 * **재시도를 자동으로 하지 않는다.** 이미지 품질은 사람이 보고 판단할 일이라(요청자 2026-09-10),
 * 마음에 안 들면 웹의 [썸네일 다시 만들기]로 사람이 다시 부른다.
 *
 * **thumb-v4 장면 방식 (KAN-138, 2026-10-07)**: 활성 프롬프트에 {장면} 칸이 있으면 — ① 텍스트 모델이 대본을 읽고 장면을 쓰고
 * (thumbnail-scene.ts, 규칙은 자산 skills/thumbnail/scene.md) ② 이미지 모델은 삼각형 없이 그림만 그리고(앵커 없음) ③ 코너 삼각형·그림자는
 * 코드가 얹는다(thumbnail-compose.ts). 칸이 없으면(v3 이하) 종전 경로 — 자산만 되돌리면 배포 없이 v3 으로 돌아간다.
 */
/**
 * 대분류별 띠 색 기본값 — 프롬프트 자산 하단 표(thumb-v1)와 같은 값이다.
 * 운영자가 콘솔 설정에서 바꾸면 settings `thumbnail.colors`가 이긴다.
 *
 * **코드에 사본을 두는 이유**: settings 행이 없는 상태(최초 배포)에서도 생성이 돌아야 한다.
 * 사본이 없으면 첫 5편을 찍어보기 전에 설정 화면부터 채워야 한다.
 */
const DEFAULT_BAND_COLORS: Record<string, string> = {
  "돈·경제": "딥 그린 (#2F6B4F)",
  비즈니스: "네이비 (#2B4C7E)",
  "과학·기술": "틸 (#2A7F9E)",
  "심리·마음": "더스티 로즈 (#B4656F)",
  "인문·교양": "앰버 (#C2783A)",
  일: "올리브 (#6B7F3A)",
  배움: "바이올렛 (#6A4C93)",
  "자격증·시험": "버건디 (#8C2F39)",
};

/** 대분류를 모를 때 — 프롬프트에서 색 슬롯만 비우면 "띠를 그리지 말라"로 읽힐 수 있어 무채색을 준다 */
const FALLBACK_BAND_COLOR = "슬레이트 그레이 (#6E6E76)";

/** 1장당 정가 (2026-09, 1024×1024). 모델·품질이 바뀌면 THUMBNAIL_USD_PER_IMAGE 로 덮는다 */
const PRICE_PER_IMAGE: Record<string, Record<string, number>> = {
  "gpt-image-1-mini": { low: 0.005, medium: 0.009, high: 0.052 },
  "gpt-image-1.5": { low: 0.009, medium: 0.013, high: 0.2 },
  "gpt-image-2": { low: 0.006, medium: 0.03, high: 0.053 },
};

export async function runThumbnail(job: Job) {
  const episodeId = String(job.payload.episode_id ?? "");
  const backlogId = String(job.payload.backlog_id ?? "");
  const force = !!job.payload.force;
  if (!cfg.openaiKey) throw new Error("OPENAI_API_KEY 가 없다 — 서버 env.prod 에 넣고 worker-io 를 재기동한다 (deploy/README 3장)");

  const ep = await getEpisode(episodeId);
  const cand = await getBacklog(backlogId);
  if (!ep || !cand) throw new Error(`에피소드/백로그 없음: ${episodeId}/${backlogId}`);

  const rel = `episodes/${episodeId}`;
  const outFile = path.join(cfg.workRoot, rel, "thumbnail.png");
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await pullPrefix(`${rel}/`);

  // 건너뛰기 (연쇄에서 이미 있는 산출물은 다시 만들지 않는다). [다시 만들기]는 force 로 이 규칙을 무시한다
  // 백로그 요약을 함께 읽는다 — 한 줄 요약이 없는 구 에피소드의 {핵심 개념} 폴백이다
  const row = await pool.query(
    "select e.thumbnail_key, e.one_liner, b.summary from public.episodes e join public.backlog b on b.id = e.backlog_id where e.id = $1",
    [episodeId],
  );
  const existingKey = row.rows[0]?.thumbnail_key as string | null;
  if (!force && existingKey && (await exists(outFile))) {
    log(`  thumbnail ${episodeId}: 이미 있음 — 건너뜀 (${existingKey})`);
    // 건너뛰어도 연쇄는 이어진다 — 여기서 멈추면 [발행 준비]가 패키지에 닿지 못한다
    const next = await advanceChain(job);
    return { episode_id: episodeId, skipped: true, thumbnail_key: existingKey, next: next?.type ?? null };
  }

  const progress = (detail: string) =>
    setJobProgress(job.id, { phase: "썸네일 생성", detail, elapsedMs: 0, toolCounts: {}, turns: 0 }).catch(() => {});

  // ── 슬롯 재료 ──
  const major = await majorOfMidTopic(cand.mid_topic);
  const colors = (await getSetting<Record<string, string>>("thumbnail.colors")) ?? {};
  const bandColor = (major && (colors[major] ?? DEFAULT_BAND_COLORS[major])) || FALLBACK_BAND_COLOR;
  const template = await loadAsset(THUMBNAIL_PROMPT_KEY);
  if (template.content.includes("{장면}")) {
    return runSceneThumbnail({ job, episodeId, backlogId, rel, outFile, template, bandColor, major, progress,
      title: cand.title, mid: cand.mid_topic, oneLiner: firstNonEmpty(row.rows[0]?.one_liner, cand.axis) });
  }

  // ── 종전 경로 (thumb-v3 이하) ──
  // 한 줄 요약이 없는 구 에피소드는 설계 축으로 대체한다(티켓 3-1) — 축도 없으면 후보 요약
  const oneLiner = firstNonEmpty(row.rows[0]?.one_liner, cand.axis, row.rows[0]?.summary);
  if (!oneLiner) throw new Error(`{핵심 개념}에 넣을 문장이 없다 (one_liner·axis·summary 모두 비었음): ${episodeId}`);
  const anchor = await loadAnchor();
  // 앵커가 있을 때만 참조 지시를 덧붙인다 — 없는데 붙이면 "첨부 이미지"를 가리키는 문장이 허공을 가리킨다
  const anchorRule = anchor ? await loadAsset(THUMBNAIL_ANCHOR_PROMPT_KEY) : null;
  const promptVersion = anchorRule ? `${template.version}+${anchorRule.version}` : template.version;
  const prompt = fillSlots(
    [promptBody(template.content), anchorRule && promptBody(anchorRule.content)].filter(Boolean).join("\n\n"),
    {
      "{제목}": cand.title,
      "{주제 분류}": cand.mid_topic,
      "{핵심 개념}": oneLiner,
      "{띠 색}": bandColor,
    },
  );

  // ── 생성 ──
  await progress(`${cfg.thumbnailModel} · ${cfg.thumbnailQuality}${anchor ? " · 앵커 참조" : ""}`);
  const started = Date.now();
  const png = anchor ? await editImage(prompt, anchor) : await generateImage(prompt);
  const elapsedMs = Date.now() - started;

  await fs.writeFile(outFile, png);
  await progress("S3 업로드");
  await pushPrefix(`${rel}/`);

  const key = s3Key(`${rel}/thumbnail.png`);
  await pool.query("update public.episodes set thumbnail_key = $2, updated_at = now() where id = $1", [episodeId, key]);

  const cost = cfg.thumbnailUsdPerImage ?? PRICE_PER_IMAGE[cfg.thumbnailModel]?.[cfg.thumbnailQuality];
  const kb = Math.round(png.length / 1024);
  const result = `썸네일 생성 — ${cfg.thumbnailModel}/${cfg.thumbnailQuality} ${cfg.thumbnailSize} · ${kb}KB · ${(elapsedMs / 1000).toFixed(1)}초${anchor ? " · 스타일 앵커 참조" : " · 앵커 없음(화풍 미고정)"} · 띠 ${bandColor} · 프롬프트 ${promptVersion} · 사람 확인 대기`;
  log(`  thumbnail ${episodeId}: ${key} (${kb}KB, ${(elapsedMs / 1000).toFixed(1)}초)`);
  await insertRun({
    backlog_id: backlogId,
    phase: "thumbnail",
    result,
    prompt_version: promptVersion,
    artifacts: [key],
    executed_by: executedBy,
    model: cfg.thumbnailModel,
    cost_usd: cost ?? null,
    tokens: { images: 1, quality: cfg.thumbnailQuality, size: cfg.thumbnailSize, bytes: png.length, anchor: !!anchor },
    worker_rev: workerRev(),
  });
  const next = await advanceChain(job);
  return { episode_id: episodeId, thumbnail_key: key, bytes: png.length, model: cfg.thumbnailModel, anchor: !!anchor, next: next?.type ?? null };
}

/**
 * thumb-v4 장면 경로 — 장면 쓰기 → 이미지(삼각형 없이) → 코너 삼각형·S2 그림자 합성. 원본 그림(thumbnail-raw.png)과 장면(thumbnail-scene.json)을
 * 함께 남긴다: 원본이 있으면 코너 마감을 바꿀 때 다시 그리지 않고 합성만 다시 하고, 장면 파일은 다음 편의 [최근 장면]이 된다.
 * 삼각형 대비(ΔE)가 20 미만이면 결과에 경고만 남긴다 — 다시 만들지는 사람이 정한다(재시도 자동화 금지, 위 머리말).
 */
async function runSceneThumbnail(a: {
  job: Job; episodeId: string; backlogId: string; rel: string; outFile: string; template: { version: string; content: string };
  bandColor: string; major: string | null; title: string; mid: string; oneLiner: string | null; progress: (detail: string) => Promise<unknown>;
}) {
  const dir = path.dirname(a.outFile);
  const sceneRule = await loadAsset(THUMBNAIL_SCENE_PROMPT_KEY);
  const script = await fs.readFile(path.join(dir, "script.md"), "utf8").catch(() => null);
  await a.progress(`장면 쓰기 · ${cfg.thumbnailSceneModel}`);
  const recent = await recentScenes(a.episodeId);
  const sr = await makeExecutor("openai").run<ThumbnailScene>({
    prompt: buildScenePrompt({ title: a.title, mid: a.mid, major: a.major, oneLiner: a.oneLiner, script }, recent),
    systemPrompt: promptBody(sceneRule.content), schema: SCENE_SCHEMA, allowedTools: [], tools: [], cwd: cfg.workRoot, timeoutMs: 180_000, model: cfg.thumbnailSceneModel,
  });
  const scene = sr.output;
  const promptVersion = `${a.template.version}+${sceneRule.version}`;
  const prompt = fillSlots(promptBody(a.template.content), {
    "{제목}": a.title, "{분야}": `${a.mid}${a.major ? ` (${a.major})` : ""}`, "{띠 색}": a.bandColor, "{장면}": scene.scene, "{빛}": scene.light,
  });

  await a.progress(`${cfg.thumbnailModel} · ${cfg.thumbnailQuality} · 장면`);
  const started = Date.now();
  const png = await generateImage(prompt);
  const elapsedMs = Date.now() - started;
  const rawFile = path.join(dir, "thumbnail-raw.png");
  await fs.writeFile(rawFile, png);
  await a.progress("코너 삼각형 합성");
  const contrast = await cornerContrast(rawFile, a.bandColor);
  await composeCorner(rawFile, a.outFile, a.bandColor);
  await fs.writeFile(path.join(dir, SCENE_FILE), JSON.stringify({ ...scene, prompt_version: promptVersion, scene_model: sr.model, corner_delta_e: contrast, at: new Date().toISOString() }, null, 2) + "\n");

  await a.progress("S3 업로드");
  await pushPrefix(`${a.rel}/`);
  const key = s3Key(`${a.rel}/thumbnail.png`);
  await pool.query("update public.episodes set thumbnail_key = $2, updated_at = now() where id = $1", [a.episodeId, key]);

  const imageCost = cfg.thumbnailUsdPerImage ?? PRICE_PER_IMAGE[cfg.thumbnailModel]?.[cfg.thumbnailQuality];
  const kb = Math.round((await fs.stat(a.outFile)).size / 1024);
  const corner = contrast < 20 ? `⚠️ 삼각형 대비 낮음(ΔE ${contrast}) — [썸네일 다시 만들기] 권장` : `삼각형 대비 ΔE ${contrast}`;
  const result = `썸네일 생성(장면) — ${cfg.thumbnailModel}/${cfg.thumbnailQuality} ${cfg.thumbnailSize} · ${kb}KB · ${(elapsedMs / 1000).toFixed(1)}초 · 장면(${scene.has_people ? "사람" : "사물"}): ${scene.scene.slice(0, 140)} · 띠 ${a.bandColor} · ${corner} · 프롬프트 ${promptVersion} · 사람 확인 대기`;
  log(`  thumbnail ${a.episodeId}: ${key} (장면 · ${kb}KB · ΔE ${contrast})`);
  await insertRun({
    backlog_id: a.backlogId,
    phase: "thumbnail",
    result,
    prompt_version: promptVersion,
    artifacts: [key, s3Key(`${a.rel}/${SCENE_FILE}`), s3Key(`${a.rel}/thumbnail-raw.png`)],
    executed_by: executedBy,
    model: cfg.thumbnailModel,
    cost_usd: imageCost != null || sr.listCostUsd != null ? (imageCost ?? 0) + (sr.listCostUsd ?? 0) : null,
    tokens: { images: 1, quality: cfg.thumbnailQuality, size: cfg.thumbnailSize, bytes: png.length, anchor: false, scene_model: sr.model, scene_usage: (sr.raw as { usage?: unknown } | undefined)?.usage, corner_delta_e: contrast },
    worker_rev: workerRev(),
  });
  const next = await advanceChain(a.job);
  return { episode_id: a.episodeId, thumbnail_key: key, bytes: png.length, model: cfg.thumbnailModel, anchor: false, scene: scene.scene, corner_delta_e: contrast, next: next?.type ?? null };
}

/** 프롬프트의 진실은 DB 다 (spec/10 3.2) — git 사본으로 조용히 폴백하지 않는다. 시딩: npm run assets:import */
async function loadAsset(key: string): Promise<{ version: string; content: string }> {
  const r = await pool.query<{ version: string; content: string }>(
    "select version, content from public.prompt_assets where status = 'active' and key = $1",
    [key],
  );
  const row = r.rows[0];
  if (!row) {
    throw new Error(`prompt_assets 에 active 자산이 없다: ${key} — 시딩(npm run assets:import) 후 웹 /assets 에서 활성화`);
  }
  return row;
}


/**
 * 슬롯을 채운다. **남은 슬롯이 있으면 중단한다** — 자리표시자가 그대로 실린 프롬프트로 이미지를 만들면
 * 과금은 되고 결과는 못 쓴다(TTS 의 플레이스홀더 검사와 같은 이유 — spec/06 4장).
 */
function fillSlots(template: string, slots: Record<string, string>): string {
  let out = template;
  for (const [slot, value] of Object.entries(slots)) out = out.split(slot).join(value);
  const left = out.match(/\{[가-힣 ]+\}/g);
  if (left?.length) throw new Error(`프롬프트에 채우지 못한 슬롯이 남았다: ${[...new Set(left)].join(" · ")} — 자산 ${THUMBNAIL_PROMPT_KEY} 확인`);
  return out;
}

/**
 * 스타일 앵커 — **설정이 env 를 이긴다.**
 *
 * 콘솔 썸네일 탭에서 마음에 드는 편을 앵커로 지정하면 `settings.thumbnail.anchor` 에 들어간다.
 * env 는 그 설정이 아직 없을 때의 기본값이다 — 앵커를 바꾸는 데 배포가 필요하면 화풍을 맞추는
 * 실험을 사람이 못 돌린다.
 *
 * 지정돼 있는데 실제로 없으면 조용히 넘어가지 않는다 — 화풍 고정이 깨진 걸 모르고 100편을 찍게 된다.
 */
async function loadAnchor(): Promise<Buffer | null> {
  const setting = await getSetting<{ key?: string }>("thumbnail.anchor");
  const configured = setting?.key || cfg.thumbnailAnchorKey;
  if (!configured) return null;
  const key = configured.replace(/^s3:/, "");
  await pullPrefix(key.slice(0, key.lastIndexOf("/") + 1));
  const local = localPathOf(`s3:${key}`);
  if (!local || !(await exists(local))) {
    throw new Error(`스타일 앵커 이미지를 찾지 못했다: ${configured} — 콘솔 썸네일 탭에서 다시 지정하거나 설정에서 지운다`);
  }
  return fs.readFile(local);
}

async function generateImage(prompt: string): Promise<Buffer> {
  const res = await callOpenAi("https://api.openai.com/v1/images/generations", {
    body: JSON.stringify({ model: cfg.thumbnailModel, prompt, size: cfg.thumbnailSize, quality: cfg.thumbnailQuality, n: 1 }),
    headers: { "content-type": "application/json" },
  });
  return decodeImage(res);
}

/** 앵커가 있으면 편집 경로로 — "이 그림과 같은 화풍"을 참조로 붙인다(seed 가 없는 API 에서 화풍을 맞추는 유일한 수단) */
async function editImage(prompt: string, anchor: Buffer): Promise<Buffer> {
  const form = new FormData();
  form.set("model", cfg.thumbnailModel);
  // 참조 지시는 프롬프트 자산(skills/thumbnail/anchor.md)이 소유한다 — 여기서 문구를 만들지 않는다
  form.set("prompt", prompt);
  form.set("size", cfg.thumbnailSize);
  form.set("quality", cfg.thumbnailQuality);
  form.set("n", "1");
  form.set("image", new Blob([new Uint8Array(anchor)], { type: "image/png" }), "anchor.png");
  return decodeImage(await callOpenAi("https://api.openai.com/v1/images/edits", { body: form }));
}

interface ImageResponse {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}

/**
 * 이미지 API 호출. **재시도하지 않는다** — 이미지 생성은 한 번이 곧 과금이라, 실패를 조용히 반복하면
 * 비용만 늘고 사람은 모른다. 실패는 작업 실패로 올려 화면에 사유가 보이게 한다(티켓 완료 조건).
 */
async function callOpenAi(url: string, init: { body: BodyInit; headers?: Record<string, string> }): Promise<ImageResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.openaiKey}`, ...(init.headers ?? {}) },
    body: init.body,
    signal: AbortSignal.timeout(300_000), // 이미지 생성은 수십 초가 걸린다 — 기본 타임아웃으로는 끊긴다 (2026-10-07 180 → 300초: 몰릴 때 4분 넘게 걸린 실측)
  });
  const text = await res.text();
  let parsed: ImageResponse;
  try {
    parsed = JSON.parse(text) as ImageResponse;
  } catch {
    throw new Error(`OpenAI 응답이 JSON 이 아니다 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`OpenAI 이미지 API 실패 (HTTP ${res.status}): ${parsed.error?.message ?? text.slice(0, 300)}`);
  return parsed;
}

async function decodeImage(res: ImageResponse): Promise<Buffer> {
  const item = res.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  // 일부 모델은 만료되는 URL 로 돌려준다 — 그 자리에서 받아 둔다(만료되면 다시 만들어야 하고 그건 재과금이다)
  if (item?.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error(`이미지 URL 다운로드 실패 (HTTP ${img.status})`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("OpenAI 응답에 이미지가 없다 (b64_json·url 둘 다 없음)");
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}
