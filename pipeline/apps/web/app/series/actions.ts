"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { pipelineLocale } from "@/lib/locale";
import { majorTopicsFor } from "@/lib/taxonomy";
import { screenGlobalTopic } from "@/lib/topic-screen";
import { cleanPlan, seriesEpisodeHint, type SeriesEpisode, type SeriesRow } from "@/lib/series";
import { enqueueJob } from "../actions";

/**
 * 기획 시리즈 (spec/11 3·4·9장 · 글로벌 명세 6.11, KAN-136). 거부는 throw 가 아니라 반환값으로 — 운영 빌드는 서버 액션 오류 문구를 가린다.
 */
type Result<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

async function loadSeries(id: string): Promise<SeriesRow | null> {
  const sb = await supabaseServer();
  const { data } = await sb.from("series").select("*").eq("id", id).single();
  return (data as SeriesRow | null) ?? null;
}

/** [주제 기획] › 시리즈 — 시리즈 행(기획 중)을 만들고 설계안 작업(series_plan)을 건다. 편수는 선택이고 상한이 없다(2026-10-17) */
export async function requestSeriesPlan(input: { midTopic: string; name: string; scope: string; episodes?: number | null }): Promise<Result<{ id: string }>> {
  const en = pipelineLocale() === "en";
  const name = input.name.trim(); const scope = input.scope.trim(); const mid = input.midTopic.trim();
  if (name.length < 2) return { ok: false, reason: "시리즈 이름안이 너무 짧다" };
  if (scope.length < 10) return { ok: false, reason: "다룰 범위를 더 적어 달라 — 편 목록의 재료다" };
  const episodes = input.episodes && input.episodes > 0 ? Math.round(input.episodes) : null;
  const sb = await supabaseServer();
  if (en) {
    if (!majorTopicsFor("en").includes(mid)) return { ok: false, reason: `모르는 주제: ${mid}` };
    try {
      const screen = await screenGlobalTopic({ topics: [mid], title: name, hint: scope });
      if (screen.excluded) return { ok: false, reason: `배제 주제 — ${screen.reason}` };
    } catch (e: any) { return { ok: false, reason: String(e?.message ?? e) }; }
  } else {
    const { data: t } = await sb.from("topics").select("mid").eq("mid", mid).maybeSingle();
    if (!t) return { ok: false, reason: `중분류 '${mid}' 가 없다` };
  }
  const { data, error } = await sb.from("series").insert({ name, mid_topic: mid, scope_note: scope, status: "planning" }).select("id").single();
  if (error) return { ok: false, reason: error.message };
  await enqueueJob("series_plan", { series_id: data.id, ...(episodes ? { episodes } : {}) });
  revalidatePath("/series");
  return { ok: true, id: data.id as string };
}

/** 설계안 다시 만들기 — 기획 중일 때만. 지금 편 목록은 작업이 끝나면 덮어쓴다 */
export async function regenerateSeriesPlan(id: string, episodes?: number | null): Promise<Result> {
  const s = await loadSeries(id);
  if (!s) return { ok: false, reason: "시리즈가 없다" };
  if (s.status !== "planning") return { ok: false, reason: "기획 중일 때만 다시 만들 수 있다" };
  await enqueueJob("series_plan", { series_id: id, ...(episodes && episodes > 0 ? { episodes: Math.round(episodes) } : {}) });
  revalidatePath(`/series/${id}`);
  return { ok: true };
}

/** 설계안 저장(사람 편집) — 기획 중일 때만. 승인 뒤 편 변경은 첫 발행 전 재작성 흐름(spec/11 3장)이라 이 화면에서 막는다 */
export async function saveSeries(id: string, v: { name: string; intro_line: string; plan: SeriesEpisode[] }): Promise<Result<{ problems: string[] }>> {
  const s = await loadSeries(id);
  if (!s) return { ok: false, reason: "시리즈가 없다" };
  if (s.status !== "planning") return { ok: false, reason: "기획 중일 때만 고칠 수 있다" };
  const name = v.name.trim();
  if (name.length < 2) return { ok: false, reason: "시리즈 이름이 너무 짧다" };
  const { plan, problems } = cleanPlan(v.plan);
  const sb = await supabaseServer();
  const { error } = await sb.from("series").update({ name, intro_line: v.intro_line.trim() || null, plan }).eq("id", id).eq("status", "planning");
  if (error) return { ok: false, reason: error.message };
  revalidatePath(`/series/${id}`);
  return { ok: true, problems };
}

/**
 * [승인] = 게이트 S, 편수 확정 (spec/11 3장). 승인자·시각은 트리거가 찍는다. 그다음 편마다 B-② 주제 기획 작업을 건다(4장) —
 * payload 에 series_id·series_no 와 이 편 범위·형제 편 범위 힌트를 싣는다. 글로벌판은 편마다 배제 주제를 먼저 판정해 게이트 1 조건 3 의 기록으로 넘긴다.
 */
export async function approveSeries(id: string): Promise<Result<{ queued: number }>> {
  const s = await loadSeries(id);
  if (!s) return { ok: false, reason: "시리즈가 없다" };
  if (s.status !== "planning") return { ok: false, reason: `기획 중이 아니다 (${s.status})` };
  const { plan, problems } = cleanPlan(s.plan ?? []);
  if (problems.length) return { ok: false, reason: `설계안을 먼저 고쳐 달라 — ${problems.join(" · ")}` };
  const en = pipelineLocale() === "en";
  const screens = new Map<number, unknown>();
  if (en) {
    for (const ep of plan) {
      try {
        const sc = await screenGlobalTopic({ topics: [s.mid_topic], title: ep.title, hint: ep.scope });
        if (sc.excluded) return { ok: false, reason: `${ep.no}화 "${ep.title}" 배제 주제 — ${sc.reason}` };
        screens.set(ep.no, sc);
      } catch (e: any) { return { ok: false, reason: String(e?.message ?? e) }; }
    }
  }
  const sb = await supabaseServer();
  const { data: done, error } = await sb.from("series").update({ status: "approved", total_episodes: plan.length, plan }).eq("id", id).eq("status", "planning").select("id");
  if (error) return { ok: false, reason: error.message };
  if (!done?.length) return { ok: false, reason: "그 사이 다른 사람이 상태를 바꿨다" };
  const row = { ...s, plan };
  for (const ep of plan) {
    await enqueueJob("sweep", { mode: "B2", mid_topic: s.mid_topic, topic: ep.title, hint: seriesEpisodeHint(row, ep.no, en), series_id: id, series_no: ep.no, ...(en ? { screen: screens.get(ep.no) } : {}) });
  }
  revalidatePath(`/series/${id}`); revalidatePath("/series"); revalidatePath("/backlog");
  return { ok: true, queued: plan.length };
}

/** [시리즈 중단] — 발행 전만. 아직 초안에 들어가지 않은 편 후보는 반려하고, 이미 만든 편은 보관만 한다(회상·예고가 있어 단일 편으로 내지 않는다) */
export async function cancelSeries(id: string): Promise<Result<{ rejected: number }>> {
  const s = await loadSeries(id);
  if (!s) return { ok: false, reason: "시리즈가 없다" };
  if (!["planning", "approved"].includes(s.status)) return { ok: false, reason: `발행 전에만 중단할 수 있다 (${s.status})` };
  const sb = await supabaseServer();
  const { error } = await sb.from("series").update({ status: "cancelled" }).eq("id", id).in("status", ["planning", "approved"]);
  if (error) return { ok: false, reason: error.message };
  const { data: rej, error: e2 } = await sb.from("backlog").update({ status: "rejected" }).eq("series_id", id).in("status", ["proposed", "held", "approved"]).select("id");
  if (e2) return { ok: false, reason: e2.message };
  revalidatePath(`/series/${id}`); revalidatePath("/series"); revalidatePath("/backlog");
  return { ok: true, rejected: rej?.length ?? 0 };
}
