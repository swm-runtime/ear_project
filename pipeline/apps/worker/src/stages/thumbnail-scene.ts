import { pool } from "../db.js";
import { storage } from "../storage.js";

/**
 * 썸네일 장면 쓰기 (KAN-138 thumb-v4, 2026-10-07).
 *
 * thumb-v3 까지는 {핵심 개념}(한 줄 요약)을 은유하는 오브젝트 하나를 그리게 했고, 추상어가 표준 아이콘으로 수렴해
 * 발행 40편에서 토글 3·깔때기 2·옆얼굴 5 처럼 소재가 겹쳤다. v4 는 텍스트 모델이 대본을 읽고
 * "분야가 보이는 장소·사물 + 관점을 보여 주는 행동"의 장면 한 문장을 쓰고, 이미지 프롬프트의 {장면} 칸에 넣는다.
 * 규칙 문구는 DB 자산 `skills/thumbnail/scene.md` 가 소유한다 — 여기서는 입력을 엮고 결과를 받는다.
 *
 * 겹침 방지: 최근 썸네일 실행 기록이 남긴 장면 파일(thumbnail-scene.json)을 [최근 장면]으로 넘긴다 — 사람 장면 비율·시간대도 이걸로 섞는다.
 */
export interface ThumbnailScene { scene: string; domain_cue: string; action: string; light: string; has_people: boolean }
export const SCENE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["scene", "domain_cue", "action", "light", "has_people"],
  properties: { scene: { type: "string" }, domain_cue: { type: "string" }, action: { type: "string" }, light: { type: "string" }, has_people: { type: "boolean" } },
} as const;
export const SCENE_FILE = "thumbnail-scene.json";
export const RECENT_SCENES = 10;

export function buildScenePrompt(ep: { title: string; mid: string; major: string | null; oneLiner: string | null; script: string | null }, recent: ThumbnailScene[]): string {
  const rec = recent.length ? recent.map((x, i) => `${i + 1}. (${x.has_people ? "사람 있음" : "사람 없음"}) ${x.scene} · 빛: ${x.light}`).join("\n") : "없음";
  return [
    `[에피소드]\n제목: ${ep.title}\n분야: ${ep.mid}${ep.major ? ` (${ep.major})` : ""}\n한 줄 요약: ${ep.oneLiner ?? "없음"}`,
    `[최근 장면]\n${rec}`,
    `[대본]\n${ep.script ?? "(대본 없음 — 제목과 한 줄 요약으로만 정한다)"}`,
  ].join("\n\n");
}

/** 최근 썸네일 실행의 장면 — 새 것부터, 이 에피소드는 뺀다. 파일이 없거나 깨진 기록은 건너뛴다(v3 이하 실행에는 장면 파일이 없다) */
export async function recentScenes(excludeEpisodeId: string, limit = RECENT_SCENES): Promise<ThumbnailScene[]> {
  const r = await pool.query<{ artifacts: string[] | null }>(
    "select artifacts from public.runs where phase = 'thumbnail' and executed_at > now() - interval '180 days' order by executed_at desc limit 60",
  );
  const out: ThumbnailScene[] = []; const seen = new Set<string>();
  for (const row of r.rows) {
    const key = (row.artifacts ?? []).find((a) => a.endsWith(`/${SCENE_FILE}`));
    if (!key || key.includes(`/${excludeEpisodeId}/`) || seen.has(key)) continue;
    seen.add(key);
    // S3 에서 직접 — getFile 은 로컬 캐시를 먼저 읽어, 다른 워커가 다시 만든 편의 옛 장면을 볼 수 있다
    const text = await storage().get(key.replace(/^s3:/, "")).then((b) => b.toString("utf8")).catch(() => null);
    try { const s = JSON.parse(text ?? "") as ThumbnailScene; if (s?.scene) out.push(s); } catch { /* 깨진 파일 */ }
    if (out.length >= limit) break;
  }
  return out;
}
