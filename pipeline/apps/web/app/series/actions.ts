"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { pipelineLocale } from "@/lib/locale";
import { majorTopicsFor } from "@/lib/taxonomy";
import { screenGlobalTopic } from "@/lib/topic-screen";
import { cleanPlan, cleanSeriesThumb, seriesEpisodeHint, seriesReplanBlocker, type SeriesEpisode, type SeriesPublishEpisode, type SeriesRow } from "@/lib/series";
import { enqueueJob } from "../actions";
import { loadPublications } from "@/lib/publications-server";
import { layersBlocker, newPublicationBlocker, publicationOf, type PublicationStyle } from "@ear/pipeline/publication";

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

/**
 * [이 편 다시 기획] (spec/11 4장, 2026-10-27) — 반려·보류된 편을 같은 화 번호로 다시 기획한다. 승인 때 건 것과 같은 B-② 작업(설계안 제목·범위·형제 편 힌트, 글로벌판은 배제 주제 재판정)을
 * 하나 더 건다. 그 화의 남은 후보(보류·제안)는 반려로 정리해 한 화에 살아 있는 후보가 하나만 남게 한다 — 앞 편 조회·발행 목록은 반려를 빼고 본다.
 */
export async function replanSeriesEpisode(id: string, no: number): Promise<Result<{ rejected: number }>> {
  const s = await loadSeries(id);
  if (!s) return { ok: false, reason: "시리즈가 없다" };
  const ep = (s.plan ?? []).find((e) => e.no === no);
  if (!ep) return { ok: false, reason: `설계안에 ${no}화가 없다` };
  const sb = await supabaseServer();
  const { data: cands, error: e0 } = await sb.from("backlog").select("id,status").eq("series_id", id).eq("series_no", no);
  if (e0) return { ok: false, reason: e0.message };
  const { data: jobs } = await sb.from("jobs").select("id,payload").eq("type", "sweep").in("status", ["queued", "claimed", "running"]).eq("payload->>series_id", id);
  const ids = new Set((cands ?? []).map((c) => c.id));
  const active = (jobs ?? []).some((j) => { const p = j.payload as { series_no?: number; backlog_id?: string }; return Number(p.series_no) === no || (p.backlog_id ? ids.has(p.backlog_id) : false); });
  const blocker = seriesReplanBlocker(s, no, cands ?? [], active);
  if (blocker) return { ok: false, reason: blocker };
  const en = pipelineLocale() === "en";
  let screen: unknown = undefined;
  if (en) {
    try {
      const sc = await screenGlobalTopic({ topics: [s.mid_topic], title: ep.title, hint: ep.scope });
      if (sc.excluded) return { ok: false, reason: `${no}화 "${ep.title}" 배제 주제 — ${sc.reason}` };
      screen = sc;
    } catch (e: any) { return { ok: false, reason: String(e?.message ?? e) }; }
  }
  const live = (cands ?? []).filter((c) => c.status !== "rejected").map((c) => c.id);
  if (live.length) {
    const { error: e1 } = await sb.from("backlog").update({ status: "rejected" }).in("id", live);
    if (e1) return { ok: false, reason: e1.message };
  }
  await enqueueJob("sweep", { mode: "B2", mid_topic: s.mid_topic, topic: ep.title, hint: seriesEpisodeHint(s, no, en), series_id: id, series_no: no, replan: true, ...(en ? { screen } : {}) });
  revalidatePath(`/series/${id}`); revalidatePath("/backlog");
  return { ok: true, rejected: live.length };
}

/**
 * 새 간행물 (2026-10-27) — 이름 + 워커에 있는 디자인(키워드·장면·회화집) 중 하나. `publications` 테이블(0036)에 이 판(locale)으로 넣는다.
 * 키는 바꾸지 않는 저장 값이라 자동 생성(`p-<시각36진수>`), 서버에는 이름이 나간다. 상수 셋과 같은 이름은 거부(글자가 같으면 앱이 같은 간행물로 묶는다).
 */
export async function createPublication(v: { name: string; style: PublicationStyle; hint: string }): Promise<Result<{ key: string }>> {
  const locale = pipelineLocale();
  const list = await loadPublications();
  const blocker = newPublicationBlocker(v, locale, list);
  if (blocker) return { ok: false, reason: blocker };
  const key = `p-${Date.now().toString(36)}`;
  const sb = await supabaseServer();
  const { error } = await sb.from("publications").insert({ key, locale, name: v.name.trim(), style: v.style, hint: v.hint.trim() || null });
  if (error) return { ok: false, reason: /publications/.test(error.message) && /does not exist|schema cache/.test(error.message) ? "publications 테이블이 아직 없다 — 마이그레이션 0036 적용 뒤에 만들 수 있다" : error.message };
  revalidatePath("/series");
  return { ok: true, key };
}

/** 반려된 편 후보를 보류로 되돌린다 — 소스만 더 찾으면 되는 편은 백로그의 [보강]·[승인]으로 살린다. 그 화에 살아 있는 다른 후보가 있으면 거부 */
export async function restoreSeriesEpisode(id: string, backlogId: string): Promise<Result> {
  const sb = await supabaseServer();
  const { data: b } = await sb.from("backlog").select("id,status,series_id,series_no").eq("id", backlogId).maybeSingle();
  if (!b || b.series_id !== id) return { ok: false, reason: "이 시리즈의 편 후보가 아니다" };
  if (b.status !== "rejected") return { ok: false, reason: `반려 상태가 아니다 (${b.status})` };
  const { data: others } = await sb.from("backlog").select("id,status").eq("series_id", id).eq("series_no", b.series_no).neq("id", backlogId).neq("status", "rejected");
  if (others?.length) return { ok: false, reason: `${b.series_no}화에 살아 있는 후보 ${others.map((o) => `${o.id}(${o.status})`).join(", ")} 가 있다` };
  const { error } = await sb.from("backlog").update({ status: "held" }).eq("id", backlogId).eq("status", "rejected");
  if (error) return { ok: false, reason: error.message };
  revalidatePath(`/series/${id}`); revalidatePath("/backlog");
  return { ok: true };
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

// ── [시리즈 발행]·[시리즈 회수] (spec/11 7장, KAN-136 6단계) — 제품 호출은 브라우저 세션이 하고, 여기서는 파이프라인 기록만 ──

/** 발행 화면의 편 목록 — 후보(화 순서) + 편마다 오디오가 있는 최신 에피소드 */
export async function seriesPublishEpisodes(id: string): Promise<SeriesPublishEpisode[]> {
  const sb = await supabaseServer();
  const { data: bls, error } = await sb.from("backlog").select("id,status,series_no,published_content_ref").eq("series_id", id).neq("status", "rejected").order("series_no"); // 반려된 후보는 뺀다 — [이 편 다시 기획]으로 같은 화 번호에 후보가 둘일 수 있다(2026-10-27)
  if (error) throw new Error(error.message);
  const ids = (bls ?? []).map((b) => b.id);
  const { data: eps } = ids.length
    ? await sb.from("episodes").select("id,backlog_id,audio_dist_key,created_at").in("backlog_id", ids).not("audio_dist_key", "is", null).order("created_at", { ascending: false })
    : { data: [] };
  const latest = new Map<string, string>();
  for (const e of eps ?? []) if (!latest.has(e.backlog_id)) latest.set(e.backlog_id, e.id);
  return (bls ?? []).map((b) => ({ no: b.series_no as number, backlog_id: b.id, status: b.status, episode_id: latest.get(b.id) ?? null, content_id: (b.published_content_ref as string | null) ?? null }));
}

/** 제품 시리즈를 만든 직후 그 id 를 남긴다 — 다시 누르면 새로 만들지 않고 이 id 로 이어서 올린다. 이미 다른 id 가 있으면 거부 */
export async function recordProductSeries(id: string, productSeriesId: string): Promise<Result> {
  const s = await loadSeries(id);
  if (!s) return { ok: false, reason: "시리즈가 없다" };
  if (s.published_series_id && s.published_series_id !== productSeriesId) return { ok: false, reason: `이미 제품 시리즈 ${s.published_series_id} 가 기록돼 있다` };
  const sb = await supabaseServer();
  const { error } = await sb.from("series").update({ published_series_id: productSeriesId }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  revalidatePath(`/series/${id}`);
  return { ok: true };
}

/** 전 편이 올라가면 시리즈를 발행으로 — 한 편이라도 남았으면 거부(이어서 올리기 대상) */
export async function finishSeriesPublish(id: string): Promise<Result> {
  const eps = await seriesPublishEpisodes(id);
  const left = eps.filter((e) => !e.content_id).map((e) => `${e.no}화`);
  if (left.length) return { ok: false, reason: `아직 안 올라간 편: ${left.join(", ")}` };
  const sb = await supabaseServer();
  const { error } = await sb.from("series").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id).in("status", ["approved", "published"]);
  if (error) return { ok: false, reason: error.message };
  revalidatePath(`/series/${id}`); revalidatePath("/series");
  return { ok: true };
}

/** [시리즈 회수] 뒤 — 편 회수는 브라우저가 제품에 하고(편마다 publish_log 도 남긴다), 여기서는 시리즈 상태만 바꾼다 */
export async function markSeriesWithdrawn(id: string): Promise<Result> {
  const sb = await supabaseServer();
  const { error } = await sb.from("series").update({ status: "withdrawn" }).eq("id", id).eq("status", "published");
  if (error) return { ok: false, reason: error.message };
  revalidatePath(`/series/${id}`); revalidatePath("/series");
  return { ok: true };
}

/**
 * 시리즈 썸네일 글자 칸 저장 (2026-10-20) — 기획·승인·발행 중 언제든. 글자는 전부 코드가 얹으므로 바탕은 그대로다. redrawBase 면 바탕 그림을 버린다(다음 썸네일이 새로 그린다).
 * regenerate = 썸네일이 이미 있는 편마다 [썸네일 다시 만들기] 작업을 건다 — 바탕은 워커가 시리즈 잠금 안에서 한 번만 그리고 나머지는 번호만 다시 얹는다
 */
export async function saveSeriesThumb(id: string, v: { publication: string | null; word: string; label: string; box: string; layers?: string }, regenerate: boolean, redrawBase = false): Promise<Result<{ queued: number }>> {
  const s = await loadSeries(id);
  if (!s) return { ok: false, reason: "시리즈가 없다" };
  if (["cancelled", "withdrawn"].includes(s.status)) return { ok: false, reason: `${s.status} 시리즈는 고치지 않는다` };
  const pubs = await loadPublications();
  const t = cleanSeriesThumb(v, pipelineLocale(), pubs);
  if (t.problems.length) return { ok: false, reason: t.problems.join(" · ") };
  const layersText = (v.layers ?? "").trim();
  if (publicationOf(t.publication, pubs)?.style === "layers") { const b = layersBlocker(layersText, s.total_episodes ?? (Array.isArray(s.plan) ? s.plan.length : null)); if (b) return { ok: false, reason: `층: ${b}` }; }
  const sb = await supabaseServer();
  // seriesthumb-v3 부터 큰 단어는 코드가 얹는다 — 글자 칸을 바꿔도 바탕은 그대로 두고, 바탕은 [바탕 그림도 새로 그리기]로만 버린다
  const rebase = redrawBase;
  const { error } = await sb.from("series").update({ publication: t.publication, thumb_word: t.word || null, thumb_label: t.label || null, thumb_box: t.box || null, thumb_layers: layersText || null, ...(rebase || regenerate ? { thumb_base_key: rebase ? null : s.thumb_base_key } : {}) }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  let queued = 0;
  if (regenerate) {
    const { data: bls } = await sb.from("backlog").select("id").eq("series_id", id);
    const ids = (bls ?? []).map((b) => b.id);
    const { data: eps } = ids.length ? await sb.from("episodes").select("id,backlog_id,thumbnail_key,created_at").in("backlog_id", ids).not("thumbnail_key", "is", null).order("created_at", { ascending: false }) : { data: [] };
    const seen = new Set<string>();
    for (const e of eps ?? []) {
      if (seen.has(e.backlog_id)) continue;
      seen.add(e.backlog_id);
      await enqueueJob("thumbnail", { episode_id: e.id, backlog_id: e.backlog_id, force: true });
      queued++;
    }
  }
  revalidatePath(`/series/${id}`);
  return { ok: true, queued };
}
