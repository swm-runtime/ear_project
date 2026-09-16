/**
 * 워커 최소 버전 (2026-09-12) — dev 머지 배포가 `settings.worker.min_rev` 에 커밋 시각을 적고, 워커는 자기 커밋이 그보다 오래됐으면
 * 작업을 집지 않는다. 옛 워커가 새 유형의 작업을 실패시키거나(critic_measure 21건, 2026-09-11) 옛 L0 로 대본을 만드는 사고를 막는다.
 *   npm run rev -- publish     현재 코드의 리비전·커밋 시각을 최소 버전으로 기록 (push.sh 가 배포 끝에 부른다)
 *   npm run rev -- status      기록된 최소 버전과 이 코드의 버전 비교
 */
import { pool } from "../db.js";
import { workerRev, workerRevTime } from "../assets.js";

export const MIN_REV_KEY = "worker.min_rev";
export interface MinRev { rev: string; committed_at: number; set_at: string; set_by: string }

async function main() {
  const cmd = process.argv[2] ?? "status";
  const rev = workerRev(), ts = workerRevTime();
  if (cmd === "publish") {
    if (!ts) { console.error("커밋 시각을 모른다(WORKER_REV_TS 없음) — 기록하지 않음"); process.exit(1); }
    const cur = (await pool.query("select value from public.settings where key = $1", [MIN_REV_KEY])).rows[0]?.value as MinRev | undefined;
    if (cur && cur.committed_at > ts) { console.log(`기록된 최소 버전(${cur.rev}, ${new Date(cur.committed_at * 1000).toISOString()})이 더 새것 — 그대로 둠`); }
    else {
      const v: MinRev = { rev, committed_at: ts, set_at: new Date().toISOString(), set_by: process.env.WORKER_NAME || "deploy" };
      await pool.query("insert into public.settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [MIN_REV_KEY, JSON.stringify(v)]);
      console.log(`워커 최소 버전 기록: ${rev} (${new Date(ts * 1000).toISOString()})`);
    }
  } else {
    const cur = (await pool.query("select value from public.settings where key = $1", [MIN_REV_KEY])).rows[0]?.value as MinRev | undefined;
    console.log(`이 코드: ${rev} (${ts ? new Date(ts * 1000).toISOString() : "시각 미상"}) · 최소 버전: ${cur ? `${cur.rev} (${new Date(cur.committed_at * 1000).toISOString()})` : "(없음)"} → ${!cur || !ts || ts >= cur.committed_at ? "OK" : "오래됨 — git pull 필요"}`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
