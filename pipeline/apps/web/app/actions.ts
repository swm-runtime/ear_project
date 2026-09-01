"use server";
import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase-server";
import { coldOpenStatus, replaceTurn } from "@/lib/artifacts";

/** 게이트 1 (사람): proposed → approved / rejected / held. approved_by·approved_at 는 DB 트리거가 세션에서 찍는다. */
export async function setBacklogStatus(id: string, status: "approved" | "rejected" | "held" | "proposed" | "qa_passed") {
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
 * 파일을 고치고 수정 전/후를 episodes.human_edits 에 누적한다. 리포트 파일은 건드리지 않는다.
 */
export async function editScriptTurn(episodeId: string, turn: string, after: string, reason?: string) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: ep, error } = await sb.from("episodes").select("script_key,human_edits").eq("id", episodeId).single();
  if (error) throw new Error(error.message);
  if (!ep?.script_key?.startsWith("local:")) throw new Error("대본 파일 경로를 찾을 수 없습니다 (S3 이관 후 지원)");
  const root = process.env.WORK_ROOT ?? process.env.REPO_ROOT;
  if (!root) throw new Error("WORK_ROOT 미설정");
  const file = path.resolve(root, ep.script_key.slice(6));
  if (!file.startsWith(path.resolve(root))) throw new Error("경로 오류");

  const md = await fs.readFile(file, "utf-8");
  const r = replaceTurn(md, turn, after.trim());
  if (!r) throw new Error(`대본에서 ${turn} 을 찾을 수 없습니다`);
  if (r.before.trim() === after.trim()) return { changed: false, coldOpenBroken: false };
  await fs.writeFile(file, r.md, "utf-8");

  const entry = { turn, before: r.before, after: after.trim(), reason: reason?.trim() || null, by: user?.email ?? null, at: new Date().toISOString() };
  const { error: e2 } = await sb.from("episodes").update({ human_edits: [...(ep.human_edits ?? []), entry] }).eq("id", episodeId);
  if (e2) throw new Error(e2.message);

  const cold = coldOpenStatus(r.md);
  revalidatePath(`/episodes/${episodeId}`);
  return { changed: true, coldOpenBroken: cold.turn === turn && !cold.ok };
}

/** 사람 수정 후 재QA — 사람 수정도 환각·중복을 만들 수 있으므로 사실 검증을 다시 돌린다 (spec/05) */
export async function requestReQa(episodeId: string, backlogId: string) {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("jobs").insert({ type: "qa", requires_ai: true, status: "queued", payload: { episode_id: episodeId, backlog_id: backlogId, attempt: 1, human_revision: true } }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath(`/episodes/${episodeId}`);
  return data.id as string;
}
