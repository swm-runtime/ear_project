import os from "node:os";
import { pool } from "./db.js";

/**
 * 복제 중 하나만 도는 부가 작업의 임대 (2026-10-30 — 한국판 워커 복제 도입).
 * 작업 큐는 claim_job 의 skip locked 라 복제가 여럿이어도 안전하지만, 프로세스 메모리에 상태를 두는 부가 작업
 * (백엔드 오류 감시의 읽은 위치 · TTS 잔량 확인 주기)은 복제 수만큼 겹친다 — 같은 오류가 Slack 에 복제 수만큼 간다.
 * settings 'lease.<이름>' 한 줄에 주인·만료를 비교 후 갱신한다(원자적 UPDATE). 주인은 부를 때마다 연장하고, 주인이 죽으면 만료 뒤 다른 복제가 넘겨받는다.
 * 주인 식별은 컨테이너 호스트 이름 + PID — 복제는 WORKER_NAME 이 같다. DB 오류면 false(이번 차례를 건너뛴다).
 */
export const LEASE_OWNER = `${os.hostname()}:${process.pid}`;

export async function holdLease(name: string, ttlMs: number, owner: string = LEASE_OWNER): Promise<boolean> {
  try {
    const key = `lease.${name}`;
    await pool.query("insert into public.settings (key, value) values ($1, '{}'::jsonb) on conflict (key) do nothing", [key]);
    const r = await pool.query(
      `update public.settings set value = value || jsonb_build_object('owner', $2::text, 'until', (now() + make_interval(secs => $3::double precision))::text), updated_at = now()
        where key = $1 and (value->>'owner' is null or value->>'owner' = $2 or (value->>'until')::timestamptz < now())
        returning key`,
      [key, owner, ttlMs / 1000]);
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

/** 임대 줄에 함께 두는 값(예: 오류 감시의 읽은 위치) — 주인이 바뀌어도 이어받게 */
export async function leaseValue<T>(name: string, field: string): Promise<T | null> {
  try {
    const r = await pool.query("select value->$2 v from public.settings where key = $1", [`lease.${name}`, field]);
    return (r.rows[0]?.v ?? null) as T | null;
  } catch {
    return null;
  }
}
export async function setLeaseValue(name: string, field: string, v: unknown): Promise<void> {
  await pool.query("update public.settings set value = value || jsonb_build_object($2::text, $3::jsonb) where key = $1", [`lease.${name}`, field, JSON.stringify(v)]).catch(() => {});
}
