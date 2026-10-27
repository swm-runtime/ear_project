/**
 * 기획 시리즈 (spec/11 · 글로벌 명세 6.11, KAN-136) — 콘솔 쪽 형식·검증·편별 힌트. 워커 @ear/pipeline series.ts 의 SeriesPlanEpisode 와 같은 모양이다(바꾸면 둘 다).
 */
import { publicationOf } from "@ear/pipeline/publication";
import type { PipelineLocale } from "./locale";

export interface SeriesEpisode { no: number; title: string; scope: string; carries: string; only_here: string; minutes: number }
export interface SeriesRow {
  id: string; name: string; mid_topic: string; intro_line: string | null; scope_note: string | null; plan: SeriesEpisode[];
  total_episodes: number | null; status: SeriesStatus; approved_by: string | null; approved_at: string | null; published_at: string | null; created_at: string; updated_at: string;
  /** 제품 series_id — [시리즈 발행]이 POST /admin/series 로 받은 값(KAN-134). 받기 전엔 null */
  published_series_id: string | null;
  /** 시리즈 썸네일 글자 칸(0031, 2026-10-20) — 큰 단어는 이미지 모델이 바탕에 그리고, 라벨·박스는 코드가 얹는다. thumb_base_key = 바탕 그림 s3 키 */
  thumb_word: string | null; thumb_label: string | null; thumb_box: string | null; thumb_base_key: string | null;
  /** 간행물 키(0034, KAN-247 — @ear/pipeline publication.ts) — 발행 이름(서버 publisher_name)과 썸네일 스타일. null = 없음 */
  publication: string | null;
}

/** 간행물·썸네일 글자 칸 검증 (KAN-247) — 간행물은 이 판의 목록에서만, keyword 스타일 간행물은 큰 단어가 필요하다. 큰 단어는 영문(손글씨로 얹는다), 라벨·박스는 짧게(코드가 한 줄로 얹는다) */
export function cleanSeriesThumb(v: { publication: string | null; word: string; label: string; box: string }, locale: PipelineLocale): { publication: string | null; word: string; label: string; box: string; problems: string[] } {
  const word = v.word.trim().toLowerCase(), label = v.label.trim().toUpperCase(), box = v.box.trim();
  const publication = v.publication || null;
  const problems: string[] = [];
  const pub = publicationOf(publication);
  if (publication && (!pub || pub.locale !== locale)) problems.push(`간행물 "${publication}" 은 이 판의 목록에 없다`);
  // 종전(2026-10-20) "큰 단어를 비우면 일반 썸네일" 판정은 간행물이 대신한다 — keyword 디자인 간행물은 큰 단어가 있어야 편 썸네일을 만들 수 있다
  if (pub?.style === "keyword" && !word) problems.push(`간행물 "${pub.name}" 은 키워드 시리즈 디자인이라 큰 단어가 필요하다`);
  if (word && !/^[a-z][a-z' -]{1,15}$/.test(word)) problems.push("큰 단어는 영문 2~16자다(손글씨 글꼴로 얹는다)");
  if (label.length > 24) problems.push("라벨은 24자 이내다");
  if (box.length > 12) problems.push("박스 글자는 12자 이내다");
  return { publication, word, label, box, problems };
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

// ── [이 편 다시 기획] (spec/11 4장, 2026-10-27) ─────────────────────────────

/**
 * 반려·보류된 편을 같은 화 번호로 다시 기획해도 되는지 — 사유를 돌려주면 막는다.
 * 승인된 시리즈(첫 발행 전)에서만, 그 화 번호의 후보가 전부 반려·보류·제안 상태이고(초안에 들어간 후보가 있으면 안 된다), 그 화의 기획·보강 작업이 돌고 있지 않을 때.
 */
export function seriesReplanBlocker(s: Pick<SeriesRow, "status">, no: number, candidates: { id: string; status: string }[], activeJob: boolean): string | null {
  if (s.status !== "approved") return `승인된 시리즈(첫 발행 전)에서만 다시 기획한다 (${s.status})`;
  const busy = candidates.filter((c) => !["rejected", "held", "proposed"].includes(c.status));
  if (busy.length) return `${no}화 ${busy.map((c) => `${c.id}(${c.status})`).join(", ")} 가 이미 초안 이후다 — 편 변경은 재작성 흐름(3장)으로`;
  if (activeJob) return `${no}화 기획·보강 작업이 이미 큐·실행 중이다`;
  return null;
}

// ── [시리즈 발행] (spec/11 7장, KAN-136 6단계) ─────────────────────────────

/** 발행 화면이 보는 편 하나 — 백로그 후보 + 그 편의 최신 에피소드 */
export interface SeriesPublishEpisode {
  no: number; backlog_id: string; status: string; episode_id: string | null;
  /** 제품 content_id — 이미 올린 편(이어서 올리기는 이 편을 건너뛴다) */
  content_id: string | null;
}

/** 콘텐츠 제목 `{시리즈 이름} {N} - {편 제목}` — 번호는 0 없이(spec/11 7장, CS 선례). 이미 그 머리로 시작하면 그대로 둔다 */
export function seriesContentTitle(name: string, no: number, title: string): string {
  const head = `${name.trim()} ${no} - `;
  const t = title.trim();
  return t.startsWith(head) ? t : head + t;
}

/**
 * [시리즈 발행]을 막는 사유 — 비면 열린다. 전 편이 packaged(또는 이미 published)이고 설계안 편수와 후보 수가 같으며,
 * 올릴 편마다 에피소드·검수 확인·추천 메타가 있어야 한다(spec/11 7장 "전 편이 packaged 이고 검수 확인·추천 메타가 갖춰지면").
 */
export function seriesPublishBlockers(s: Pick<SeriesRow, "status" | "total_episodes">, eps: SeriesPublishEpisode[], ready: Record<string, { reviewed: boolean; enrichment: boolean }>): string[] {
  const out: string[] = [];
  if (!["approved", "published"].includes(s.status)) out.push(`시리즈 상태가 ${s.status} — 승인된 시리즈만 발행한다`);
  const total = s.total_episodes ?? 0;
  if (!total) out.push("설계안 편수가 정해지지 않았다");
  const nos = eps.map((e) => e.no).sort((a, b) => a - b);
  if (total && (nos.length !== total || nos.some((n, i) => n !== i + 1))) out.push(`편 후보가 1~${total}화로 다 있지 않다 (지금 ${nos.join(", ") || "없음"})`);
  for (const e of [...eps].sort((a, b) => a.no - b.no)) {
    if (e.content_id || e.status === "published") continue;
    if (e.status !== "packaged") { out.push(`${e.no}화 ${e.backlog_id} 가 아직 ${e.status} — 전 편이 패키지까지 끝나야 한다`); continue; }
    if (!e.episode_id) { out.push(`${e.no}화 에피소드가 없다`); continue; }
    const r = ready[e.backlog_id];
    if (!r?.enrichment) out.push(`${e.no}화 추천 메타가 없다`);
    if (!r?.reviewed) out.push(`${e.no}화 검수 확인이 안 됐다`);
  }
  return out;
}

/** 이번에 올릴 편 — 1화부터 순서대로, 이미 올린 편(content_id)은 건너뛴다. 앞 편이 안 올라갔는데 뒤 편이 올라가는 순서는 만들지 않는다 */
export function seriesUploadQueue(eps: SeriesPublishEpisode[]): SeriesPublishEpisode[] {
  return [...eps].sort((a, b) => a.no - b.no).filter((e) => !e.content_id);
}
