"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { coldOpenStatus, loadArtifact, replaceTurn, writeArtifact } from "@/lib/artifacts";
import { putText } from "@/lib/storage";

/** 음차 사전·발음 맵 공통 형식 검증 — {"표기": "발음"} 객체, 값은 비어 있지 않은 문자열 (spec/06 6장) */
function assertPronunciationJson(content: string): Record<string, string> {
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error('JSON 이 아닙니다 — {"표기": "발음"} 객체여야 합니다'); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error('{"표기": "발음"} 객체여야 합니다 (배열·문자열 불가)');
  for (const [k, v] of Object.entries(parsed)) {
    if (!k.trim()) throw new Error("빈 표기 키가 있습니다");
    if (typeof v !== "string" || !v.trim()) throw new Error(`"${k}" 의 발음이 비어 있거나 문자열이 아닙니다`);
  }
  return parsed as Record<string, string>;
}

/** 게이트 1 (사람): proposed → approved / rejected / held. approved_by·approved_at 는 DB 트리거가 세션에서 찍는다. */
export async function setBacklogStatus(id: string, status: "approved" | "rejected" | "held" | "proposed" | "qa_passed" | "published") {
  const sb = await supabaseServer();
  const { error } = await sb.from("backlog").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/backlog"); revalidatePath("/");
}

/** 작업 요청 (사람 트리거): sweep · tts · package · cluster 재실행. requested_by 는 트리거가 찍는다. */
export async function enqueueJob(type: "sweep" | "cluster" | "tts" | "package" | "domain_check", payload: Record<string, unknown>) {
  const sb = await supabaseServer();
  const requires_ai = type === "cluster";
  const { data, error } = await sb.from("jobs").insert({ type, requires_ai, payload, status: "queued" }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/"); revalidatePath("/sweep"); revalidatePath("/episodes");
  return data.id as string;
}

export async function cancelJob(id: string) {
  const sb = await supabaseServer();
  const { error } = await sb.from("jobs").update({ status: "cancelled" }).eq("id", id).eq("status", "queued");
  if (error) throw new Error(error.message);
  revalidatePath("/"); revalidatePath("/sweep");
}

export async function saveCriticVerdicts(episodeId: string, verdicts: unknown) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("episodes").update({ critic_verdicts: { ...(verdicts as object), judged_by: user?.email ?? null, judged_at: new Date().toISOString() } }).eq("id", episodeId);
  if (error) throw new Error(error.message);
  revalidatePath(`/episodes/${episodeId}`);
}

/** 발행 대기 목록 — 오디오(dist.mp3) 완료·미발행 에피소드. audio_dist_key 가 있고 backlog 상태가 qa_passed/packaged(=아직 published 아님)인 것. 발행 업로드 화면의 선택 목록. */
export async function listPublishableEpisodes(): Promise<{ id: string; title: string; mid_topic: string; status: string; created_at: string }[]> {
  const sb = await supabaseServer();
  const { data: eps, error } = await sb.from("episodes").select("id,backlog_id,audio_dist_key,created_at").not("audio_dist_key", "is", null).order("id", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = [...new Set((eps ?? []).map((e) => e.backlog_id))];
  if (ids.length === 0) return [];
  const { data: bls } = await sb.from("backlog").select("id,title,mid_topic,status").in("id", ids);
  const bl = Object.fromEntries((bls ?? []).map((b) => [b.id, b]));
  return (eps ?? [])
    .map((e) => ({ id: e.id, title: bl[e.backlog_id]?.title ?? e.id, mid_topic: bl[e.backlog_id]?.mid_topic ?? "", status: bl[e.backlog_id]?.status ?? "", created_at: e.created_at as string }))
    .filter((e) => ["qa_passed", "packaged"].includes(e.status));
}

/** 도메인 판정 (사람): tier·license_basis. decided_by·decided_at 는 트리거가 찍는다. */
/** 소스 풀 확인 항목 ①~④ 자동 수집 — AI 없이 HTTP만 (robots·홈·약관·표본 기사). 판정은 여전히 사람. */
export async function requestDomainCheck(domainIds: string[] | null, onlyUnchecked = true) {
  return enqueueJob("domain_check", { domain_ids: domainIds, only_unchecked: onlyUnchecked });
}

export async function decideDomain(id: string, fields: { tier: string; license_basis: string; note?: string; topic_coverage?: string[]; feed_url?: string | null }) {
  const sb = await supabaseServer();
  const { error } = await sb.from("domains").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/domains"); revalidatePath(`/domains/${id}`);
}

export async function addDomain(fields: { domain: string; publisher: string; category: string; feed_url: string | null; topic_coverage: string[]; note: string }) {
  const sb = await supabaseServer();
  const { error } = await sb.from("domains").insert({ ...fields, tier: "candidate" });
  if (error) throw new Error(error.message);
  revalidatePath("/domains");
}

export async function upsertTopic(row: Record<string, unknown>) {
  const sb = await supabaseServer();
  const { error } = await sb.from("topics").upsert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/topics");
}
export async function deleteTopic(id: string) {
  const sb = await supabaseServer();
  const { error } = await sb.from("topics").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/topics");
}

export async function saveSetting(key: string, value: unknown) {
  const sb = await supabaseServer();
  const { error } = await sb.from("settings").upsert({ key, value });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

/**
 * 대본 턴 직접 수정 (사람) — 비평 리포트에 서술로 남기는 대신 문장을 고쳐 쓴다 (2026-08-31 규약 개정).
 * S3 의 대본(`s3:` 키)을 고치고 — 버저닝이라 이전 본이 남는다 — 수정 전/후를 episodes.human_edits 에 누적한다. 리포트 파일은 건드리지 않는다.
 * 워커는 다음 단계(재QA·비평) 시작 시 S3 에서 다시 내려받으므로 수정본이 그대로 검증 대상이 된다 (spec/10 3.3).
 */
export async function editScriptTurn(episodeId: string, turn: string, after: string, reason?: string) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: ep, error } = await sb.from("episodes").select("script_key,human_edits").eq("id", episodeId).single();
  if (error) throw new Error(error.message);
  if (!ep?.script_key) throw new Error("대본 파일 키가 없습니다");
  const md = await loadArtifact(ep.script_key);
  if (md == null) throw new Error(`대본을 읽을 수 없습니다: ${ep.script_key} (PIPELINE_BUCKET·AWS 자격증명 확인)`);
  const r = replaceTurn(md, turn, after.trim());
  if (!r) throw new Error(`대본에서 ${turn} 을 찾을 수 없습니다`);
  if (r.before.trim() === after.trim()) return { changed: false, coldOpenBroken: false };
  await writeArtifact(ep.script_key, r.md);

  const entry = { turn, before: r.before, after: after.trim(), reason: reason?.trim() || null, by: user?.email ?? null, at: new Date().toISOString() };
  const { error: e2 } = await sb.from("episodes").update({ human_edits: [...(ep.human_edits ?? []), entry] }).eq("id", episodeId);
  if (e2) throw new Error(e2.message);

  const cold = coldOpenStatus(r.md);
  revalidatePath(`/episodes/${episodeId}`);
  return { changed: true, coldOpenBroken: cold.turn === turn && !cold.ok };
}

/** 규칙 자산 — 새 버전(draft) 저장 (spec/10 3.2). 규약(active 불변·활성화 note 필수·기존 active 자동 retired)은 DB 트리거가 강제한다 */
export async function saveAssetDraft(key: string, version: string, content: string, note: string) {
  const sb = await supabaseServer();
  const v = version.trim();
  if (!v) throw new Error("버전 라벨이 필요합니다 (예: full-v5.2)");
  if (!content.trim()) throw new Error("본문이 비어 있습니다");
  if (key.endsWith(".json")) assertPronunciationJson(content); // 깨진 사전을 활성화하면 TTS 가 전부 막힌다 — 저장 시점에 검증
  const { error } = await sb.from("prompt_assets").insert({ key, version: v, content, status: "draft", note: note.trim() || null });
  if (error) throw new Error(error.code === "23505" ? `이미 있는 버전입니다: ${v}` : error.message);
  revalidatePath("/assets"); revalidatePath(`/assets/${key}`);
}

/** 규칙 자산 — draft 를 활성화. 다음 작업부터 모든 워커가 이 버전을 읽는다 */
export async function activateAsset(key: string, version: string, note: string) {
  const sb = await supabaseServer();
  if (!note.trim()) throw new Error("활성화에는 변경 사유(note)가 필요합니다");
  const { error } = await sb.from("prompt_assets").update({ status: "active", note: note.trim() }).eq("key", key).eq("version", version).eq("status", "draft");
  if (error) throw new Error(error.message);
  revalidatePath("/assets"); revalidatePath(`/assets/${key}`); revalidatePath("/settings");
}

/** 에피소드 발음 맵 저장 (spec/06 6장) — TTS 병합 사전의 에피소드 층. 워커는 합성 시작 때 S3 에서 다시 내려받으므로 저장본이 그대로 적용된다 */
export async function savePronunciations(episodeId: string, content: string) {
  const entries = assertPronunciationJson(content);
  await putText(`episodes/${episodeId}/pronunciations.json`, JSON.stringify(entries, null, 2) + "\n");
  revalidatePath(`/episodes/${episodeId}`);
  return { count: Object.keys(entries).length };
}

/** 사람 수정 후 재QA — 사람 수정도 환각·중복을 만들 수 있으므로 사실 검증을 다시 돌린다 (spec/05) */
export async function requestReQa(episodeId: string, backlogId: string) {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("jobs").insert({ type: "qa", requires_ai: true, status: "queued", payload: { episode_id: episodeId, backlog_id: backlogId, attempt: 1, human_revision: true } }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath(`/episodes/${episodeId}`);
  return data.id as string;
}
