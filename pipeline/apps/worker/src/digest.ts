/**
 * 자동화 요약 알림 (2026-09-23 박수헌: "편마다 보내면 너무 많다 — 큐가 다 비워졌을 때 한 번에").
 *
 * 워커가 집을 작업이 없고(큐 전체가 비었고) 지난 요약 이후 무언가 일어났으면 Slack 에 한 번 보낸다:
 *   검수 대기(패키지 완료) · 검토 필요(QA 3회 실패) · 초안 실패로 승인 대기 복귀 · 자동 반려 · 발행 준비 연쇄 실패.
 * 편마다 알리지 않는다. 연쇄는 다음 작업을 큐에 넣은 뒤 끝나므로 "큐가 비었다"는 곧 돌릴 것이 없다는 뜻이다.
 *
 * 상태는 DB `settings."automation.digest"` = { sent_at } — 워커가 재시작돼도 이어지고, 갱신을 CAS 로 해서 워커가 여럿이어도 한 번만 보낸다.
 * 웹훅이 없는 워커(노트북)는 아무것도 하지 않는다. 조회는 5분에 한 번으로 묶는다.
 */
import { getSetting, pool } from "./db.js";
import { consoleUrl, hasWebhook, notifyOps } from "./notify.js";
import { readAutomation } from "./automation.js";
import { log } from "./util.js";

const CHECK_EVERY_MS = 5 * 60_000;
let lastCheck = 0;

export async function maybeSendDigest(): Promise<boolean> {
  if (!hasWebhook()) return false;
  if (Date.now() - lastCheck < CHECK_EVERY_MS) return false;
  lastCheck = Date.now();
  const s = await readAutomation();
  if (!s.auto_approve && !s.auto_publish_prep) return false;

  const active = await pool.query("select count(*)::int n from public.jobs where status in ('queued','claimed','running')");
  if (active.rows[0].n > 0) return false;

  const st = (await getSetting<{ sent_at?: string | null }>("automation.digest")) ?? {};
  const since = st.sent_at ?? "1970-01-01T00:00:00Z";

  const [packaged, review, back, rejected, prepFailed] = await Promise.all([
    pool.query(`select r.backlog_id b, b.title, (select id from public.episodes e where e.backlog_id = b.id order by created_at desc limit 1) ep
                  from public.runs r join public.backlog b on b.id = r.backlog_id
                 where r.phase = 'package' and r.executed_at > $1::timestamptz and b.status = 'packaged' order by r.executed_at`, [since]),
    pool.query(`select id, title, (select id from public.episodes e where e.backlog_id = backlog.id order by created_at desc limit 1) ep
                  from public.backlog where status = 'review_required' and updated_at > $1::timestamptz order by updated_at`, [since]),
    pool.query(`select id, title, left(dedup_note, 140) note from public.backlog where status = 'proposed' and dedup_note like '⚠️ 초안 실패%' and updated_at > $1::timestamptz order by updated_at`, [since]),
    pool.query(`select id, title, left(dedup_note, 140) note from public.backlog where status = 'rejected' and dedup_note like '⚠️ 자동 반려%' and updated_at > $1::timestamptz order by updated_at`, [since]),
    pool.query(`select type, payload->>'episode_id' ep, payload->>'backlog_id' b, split_part(coalesce(error, ''), E'\\n', 1) err
                  from public.jobs where status = 'failed' and type in ('tts','thumbnail','package') and (payload->>'auto') = 'true' and finished_at > $1::timestamptz order by finished_at`, [since]),
  ]);
  const total = packaged.rowCount! + review.rowCount! + back.rowCount! + rejected.rowCount! + prepFailed.rowCount!;
  if (total === 0) return false;

  // CAS: 지난 sent_at 이 내가 읽은 값 그대로일 때만 갱신 — 다른 워커가 먼저 보냈으면 건너뛴다
  const lock = await pool.query(
    `insert into public.settings (key, value) values ('automation.digest', jsonb_build_object('sent_at', now()))
     on conflict (key) do update set value = jsonb_build_object('sent_at', now())
     where coalesce(public.settings.value->>'sent_at', '1970-01-01T00:00:00Z')::timestamptz = $1::timestamptz
     returning key`, [since]);
  if (!lock.rowCount) return false;

  const line = (rows: { ep?: string | null; b?: string; id?: string; title?: string; note?: string; err?: string; type?: string }[], f: (r: any) => string) => rows.map(f).join("\n");
  const parts: string[] = [`:inbox_tray: *파이프라인 자동화 — 큐 비움* (${since.slice(0, 16).replace("T", " ")} 이후)`];
  if (packaged.rowCount) parts.push(`*검수 대기 ${packaged.rowCount}편* — 업로드 화면에서 [추천 메타 뽑기] → 청취 확인 → 발행\n` + line(packaged.rows, (r) => `• ${r.ep ?? "?"} ${r.b} · ${String(r.title).slice(0, 40)}`));
  if (review.rowCount) parts.push(`*검토 필요 ${review.rowCount}건* (QA 3회 실패 — 콘솔에서 턴 수정 후 재QA 또는 반려)\n` + line(review.rows, (r) => `• ${r.ep ?? "?"} ${r.id} · ${String(r.title).slice(0, 40)}`));
  if (back.rowCount) parts.push(`*초안 실패 → 승인 대기 복귀 ${back.rowCount}건* (자동 재승인 안 함 — 보강하거나 반려)\n` + line(back.rows, (r) => `• ${r.id} · ${String(r.title).slice(0, 40)} — ${String(r.note).replace(/^⚠️ 초안 실패 /, "")}`));
  if (rejected.rowCount) parts.push(`*자동 반려 ${rejected.rowCount}건* (소스 접근 불가)\n` + line(rejected.rows, (r) => `• ${r.id} · ${String(r.title).slice(0, 40)}`));
  if (prepFailed.rowCount) parts.push(`*발행 준비 연쇄 실패 ${prepFailed.rowCount}건* (에피소드 상단 [발행 준비]로 재요청)\n` + line(prepFailed.rows, (r) => `• ${r.ep} ${r.b} · ${r.type}: ${String(r.err).slice(0, 120)}`));
  parts.push(`백로그 ${consoleUrl("/backlog")} · 발행 ${consoleUrl("/publish/upload")}`);
  await notifyOps(parts.join("\n\n"));
  log(`자동화 요약 알림 전송 — 검수 대기 ${packaged.rowCount} · 검토 ${review.rowCount} · 복귀 ${back.rowCount} · 반려 ${rejected.rowCount} · 연쇄 실패 ${prepFailed.rowCount}`);
  return true;
}
