import { ENRICHMENT_SCHEMA_VERSION_FALLBACK } from "./enrichment-version";

/**
 * 발행분 추천 메타의 대체 산출물 (2026-10-31 — 짧은 판 일괄 발행이 화면을 연 시점에 추천 메타가 없어 51편이 메타 없이 나갔다).
 *
 * 발행분 [반영]·[구형 전체 재발행]은 콘텐츠 모드 산출물(`datasets/enrichment/<content_id>.json`)만 봤다. 발행 전에 뽑아 둔
 * 에피소드 모드 산출물(`episodes/<episode_id>/enrichment.json`)이 있으면 다시 뽑지 않고 그걸 보낸다 — 콘텐츠 모드가 있으면 그쪽이 먼저다.
 * 구형 형식 파일을 다시 보내 "구형"이 되풀이되지 않게 **현행 형식으로 뽑은 것만** 대체로 친다(enrich 실행 기록의 `schema N`).
 */
export const runSchemaVersion = (promptVersion: string | null | undefined): number | null => {
  const m = /schema (\d+)/.exec(promptVersion ?? "");
  return m ? Number(m[1]) : null;
};

/** enrich 실행 기록에서 현행 형식 에피소드 모드 산출물이 있는 에피소드 id */
export function currentEpisodeEnrichments(runs: { artifacts: string[] | null; prompt_version: string | null }[], min = ENRICHMENT_SCHEMA_VERSION_FALLBACK): Set<string> {
  const out = new Set<string>();
  for (const r of runs) {
    if ((runSchemaVersion(r.prompt_version) ?? 0) < min) continue;
    for (const a of r.artifacts ?? []) { const m = /episodes\/([A-Za-z0-9-]+)\/enrichment\.json$/.exec(String(a)); if (m) out.add(m[1]); }
  }
  return out;
}
