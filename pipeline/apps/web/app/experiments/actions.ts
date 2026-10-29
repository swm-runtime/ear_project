"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { pipelineLocale } from "@/lib/locale";
import { enqueueJob } from "../actions";

type Result<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

/**
 * [짧게 다시 만들기] (0040, KAN-296 단기 실험 ④ — 2026-10-29): 발행된 단편의 주제·소스로 짧은 판(5~12분) 재제작 후보를 만든다.
 * 콘솔 역할은 backlog INSERT 권한이 없어(0003 RLS) 여기서는 remake 작업만 건다 — 워커(stages/remake.ts)가 approved·short·remake_of 행을 만들고 초안을 건다.
 * 같은 원본에 살아 있는 짧은 판(반려·만료 제외)이나 큐에 든 요청이 있으면 건너뛴다.
 */
export async function requestRemakes(ids: string[]): Promise<Result<{ queued: string[]; skipped: { id: string; why: string }[] }>> {
  if (pipelineLocale() !== "ko") return { ok: false, reason: "짧은 판 실험은 한국판 파이프라인에만 있다" };
  const want = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  if (!want.length) return { ok: false, reason: "고른 편이 없다" };
  const sb = await supabaseServer();
  const [{ data: rows, error }, { data: live }, { data: jobs }] = await Promise.all([
    sb.from("backlog").select("id,status,series_id,remake_of").in("id", want),
    sb.from("backlog").select("id,remake_of,status").in("remake_of", want).not("status", "in", "(rejected,expired)"),
    sb.from("jobs").select("payload").eq("type", "remake").in("status", ["queued", "claimed", "running"]),
  ]);
  if (error) return { ok: false, reason: error.message };
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const liveOf = new Map((live ?? []).map((r) => [r.remake_of as string, r.id as string]));
  const queuedSet = new Set((jobs ?? []).map((j) => String((j.payload as { backlog_id?: string } | null)?.backlog_id ?? "")));
  const queued: string[] = []; const skipped: { id: string; why: string }[] = [];
  for (const id of want) {
    const r = byId.get(id);
    if (!r) { skipped.push({ id, why: "없는 후보" }); continue; }
    if (r.status !== "published") { skipped.push({ id, why: `발행된 편이 아니다 (${r.status})` }); continue; }
    if (r.series_id) { skipped.push({ id, why: "시리즈 편" }); continue; }
    if (r.remake_of) { skipped.push({ id, why: "이미 짧은 판" }); continue; }
    if (liveOf.has(id)) { skipped.push({ id, why: `짧은 판 ${liveOf.get(id)} 이 이미 있다` }); continue; }
    if (queuedSet.has(id)) { skipped.push({ id, why: "요청이 이미 큐에 있다" }); continue; }
    await enqueueJob("remake", { backlog_id: id });
    queued.push(id);
  }
  revalidatePath("/experiments");
  return { ok: true, queued, skipped };
}
