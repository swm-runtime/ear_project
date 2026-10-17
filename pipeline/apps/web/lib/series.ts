/**
 * 기획 시리즈 (spec/11 · 글로벌 명세 6.11, KAN-136) — 콘솔 쪽 형식·검증·편별 힌트. 워커 @ear/pipeline series.ts 의 SeriesPlanEpisode 와 같은 모양이다(바꾸면 둘 다).
 */
export interface SeriesEpisode { no: number; title: string; scope: string; carries: string; only_here: string; minutes: number }
export interface SeriesRow {
  id: string; name: string; mid_topic: string; intro_line: string | null; scope_note: string | null; plan: SeriesEpisode[];
  total_episodes: number | null; status: SeriesStatus; approved_by: string | null; approved_at: string | null; published_at: string | null; created_at: string; updated_at: string;
}
export type SeriesStatus = "planning" | "approved" | "published" | "withdrawn" | "cancelled";
export const SERIES_STATUS_LABEL: Record<SeriesStatus, string> = { planning: "기획 중", approved: "승인", published: "발행", withdrawn: "회수", cancelled: "중단" };

/** 저장·승인 전 검증 — 편이 1개 이상, 제목이 비어 있지 않고 서로 다르다. 번호는 순서대로 다시 매긴다(편수 상한 없음) */
export function cleanPlan(plan: SeriesEpisode[]): { plan: SeriesEpisode[]; problems: string[] } {
  const out = plan
    .map((e) => ({ title: String(e.title ?? "").trim(), scope: String(e.scope ?? "").trim(), carries: String(e.carries ?? "").trim(), only_here: String(e.only_here ?? "").trim(), minutes: Number(e.minutes) > 0 ? Math.round(Number(e.minutes)) : 0 }))
    .filter((e) => e.title || e.scope)
    .map((e, k) => ({ no: k + 1, ...e, carries: k === 0 ? "" : e.carries }));
  const problems: string[] = [];
  if (!out.length) problems.push("편이 없다");
  out.forEach((e) => { if (!e.title) problems.push(`${e.no}화 제목이 비어 있다`); if (!e.scope) problems.push(`${e.no}화 범위가 비어 있다`); });
  const seen = new Map<string, number>();
  for (const e of out) { const k = e.title.toLowerCase(); if (k && seen.has(k)) problems.push(`${seen.get(k)}화와 ${e.no}화 제목이 같다`); else seen.set(k, e.no); }
  return { plan: out, problems };
}

/** 편 후보(B-②)에 싣는 힌트 — 시리즈 이름·한 줄 소개 + 이 편 범위 + 형제 편 범위(이 편의 중심으로 삼지 않을 것). spec/11 4장. 글로벌판은 영어 */
export function seriesEpisodeHint(s: Pick<SeriesRow, "name" | "intro_line" | "plan">, no: number, en: boolean): string {
  const ep = s.plan.find((e) => e.no === no);
  if (!ep) throw new Error(`설계안에 ${no}화가 없다`);
  const others = s.plan.filter((e) => e.no !== no).map((e) => `${e.no}. ${e.title}${e.only_here ? ` (${e.only_here})` : ""}`).join(en ? "; " : " · ");
  return en
    ? `Series "${s.name}" episode ${no} of ${s.plan.length}. ${s.intro_line ?? ""}\nThis episode covers: ${ep.scope}${ep.only_here ? `. In depth only here: ${ep.only_here}` : ""}${ep.carries ? `. Builds on: ${ep.carries}` : ""}.\nOther episodes cover these, so do not center this episode on them: ${others}`
    : `시리즈 "${s.name}" ${s.plan.length}편 중 ${no}화. ${s.intro_line ?? ""}\n이 편의 범위: ${ep.scope}${ep.only_here ? ` · 이 편에서만 자세히: ${ep.only_here}` : ""}${ep.carries ? ` · 앞 편에서 이어받음: ${ep.carries}` : ""}\n다른 편이 다루므로 이 편의 중심으로 삼지 않을 것: ${others}`;
}
