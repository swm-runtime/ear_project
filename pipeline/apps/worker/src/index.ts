import fs from "node:fs/promises";
import { cfg, canAi, canTts, canThumbnail, executedBy } from "./config.js";
import { claimJob, enqueue, failJob, finishJob, getSetting, hasActiveDraftJob, heartbeat, listApprovedBacklog, pool, requeueJob, startJob } from "./db.js";
import { workerRev, workerRevTime } from "./assets.js";
import { probeStorage } from "./storage.js";
import { makeExecutor, setJobAbort } from "./executors/index.js";
import { startLogWatch } from "./log-watch.js";
import { runStage } from "./stages/index.js";
import { log, sleep, RetryLater } from "./util.js";
import { onDraftFailed } from "./stages/draft.js";

/**
 * ear 파이프라인 워커 (spec/10).
 *   npm run worker                 — 계속 폴링
 *   npm run worker -- --once       — 작업 1건 처리 후 종료
 *   npm run worker -- --enqueue sweep '{"mid_topic":"심리학"}'   — 작업 넣기만 (테스트용)
 * 역할은 .env 의 EXECUTOR / CAPABILITIES 로 결정 (로컬: claude-cli + ai,io · 서버: none + io).
 */
async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--enqueue") {
    const type = argv[1] as any;
    const payload = argv[2] ? JSON.parse(argv[2]) : {};
    const requiresAi = !["sweep", "tts", "package", "thumbnail"].includes(type);
    const id = await enqueue({ type, requires_ai: requiresAi, payload });
    log(`작업 생성: ${type} ${id}`, payload);
    await pool.end();
    return;
  }
  const once = argv.includes("--once");
  const drain = argv.includes("--drain"); // 큐가 비고 승인 대기도 없으면 종료 (연쇄 1건 끝까지 돌리는 테스트용)
  const ex = makeExecutor(cfg.executor, cfg.claudeModel);
  await fs.mkdir(cfg.workRoot, { recursive: true }); // 실행기 cwd — 없으면 spawn 이 실패한다
  const storageInfo = await probeStorage(); // 산출물 저장소(S3) 접근 확인 — 못 쓰면 작업을 집기 전에 죽는다 (spec/10 3.3)
  log(`워커 시작 — ${executedBy} · capabilities=${cfg.capabilities.join(",")} · AI=${canAi ? "on" : "off"} · TTS=${canTts ? "on" : "off(키 없음 — 서버가 집음)"} · 썸네일=${canThumbnail ? "on" : "off(키 없음 — 서버가 집음)"} · assets=DB+${cfg.assetSourceRoot} · work=${cfg.workRoot} · storage=${storageInfo} · rev=${workerRev()}`);
  // 백엔드 ERROR → Slack 감시 (log-watch.ts) — 자체 타이머·전부 try/catch·unref 로 작업 큐와 완전 분리. env 없으면 off
  log(`백엔드 ERROR 감시: ${startLogWatch()}`);

  let current: string | null = null;
  const stop = async () => {
    log("종료 신호 — 진행 중 작업을 큐로 되돌립니다");
    if (current) await requeueJob(current).catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);
  process.on("unhandledRejection", (r) => log(`unhandledRejection (계속 진행): ${(r as any)?.message ?? r}`));
  process.on("uncaughtException", async (e) => { log(`uncaughtException — 작업을 큐로 되돌리고 종료: ${e.message}`); if (current) await requeueJob(current).catch(() => {}); process.exit(1); }); // 터미널 닫힘 — 진행 중 작업을 큐로 되돌린다 (자식 claude -p 는 계속 돌고, 재집기 시 산출물이 있으면 이어받음)

  // 워커 최소 버전 게이트 (2026-09-12): dev 머지 배포가 적은 최소 커밋 시각보다 이 코드가 오래됐으면 작업을 집지 않는다 — 옛 워커가 새 유형을 실패시키거나 옛 규칙으로 대본을 만드는 사고 방지.
  // 커밋 시각을 모르면(0) 게이트를 건너뛴다. 60초마다 다시 본다.
  let revCheckedAt = 0, revStale = false;
  const revGate = async () => {
    if (Date.now() - revCheckedAt < 60_000) return revStale;
    revCheckedAt = Date.now();
    const mine = workerRevTime(); if (!mine) return (revStale = false);
    const min = await getSetting<{ rev: string; committed_at: number }>("worker.min_rev").catch(() => null);
    const stale = !!min && mine < min.committed_at && !workerRev().startsWith(min.rev);
    if (stale && !revStale) log(`⚠ 이 워커의 코드(${workerRev()}, ${new Date(mine * 1000).toISOString().slice(0, 16)})가 최소 버전(${min!.rev}, ${new Date(min!.committed_at * 1000).toISOString().slice(0, 16)})보다 오래됨 — 작업을 집지 않는다. git pull 후 재시작`);
    if (!stale && revStale) log("워커 코드 최신 — 작업 집기 재개");
    return (revStale = stale);
  };

  while (true) {
    try {
      if (await revGate()) { if (once) { log("워커 코드가 오래됨 — 종료"); break; } await sleep(60_000); continue; }
      if (canAi) await pickupApproved();
      const job = await claimJob(cfg.workerName, canAi, canTts, canThumbnail);
      if (!job) {
        if (once) { log("대기 중인 작업 없음"); break; }
        if (drain && (await listApprovedBacklog()).length === 0) { log("큐 비움 — drain 종료"); break; }
        await sleep(cfg.pollIntervalMs);
        continue;
      }
      current = job.id;
      log(`▶ ${job.type} ${job.id.slice(0, 8)} attempt ${job.attempt}`, job.payload);
      await startJob(job.id);
      // 취소 감지 (2026-09-12): 하트비트가 status 를 돌려주고, 콘솔이 cancelled 로 바꿨으면 실행 중인 claude 프로세스를 끊는다 (15초 안)
      const ac = new AbortController(); setJobAbort(ac);
      const hb = setInterval(() => heartbeat(job.id).then((st) => { if (st === "cancelled" && !ac.signal.aborted) { log(`⏹ ${job.type} ${job.id.slice(0, 8)} 콘솔에서 취소됨 — 중단`); ac.abort(); } }).catch(() => {}), 15_000);
      try {
        const result = await runStage(job, ex);
        await finishJob(job.id, result);
        if (ac.signal.aborted) log(`⏹ ${job.type} ${job.id.slice(0, 8)} 취소됨 (단계는 끝났으나 결과는 버림)`); else log(`✔ ${job.type} ${job.id.slice(0, 8)} 완료`);
      } catch (e: any) {
        if (ac.signal.aborted || e?.name === "JobCancelled") {
          log(`⏹ ${job.type} ${job.id.slice(0, 8)} 취소 처리 완료`);
          if (job.type === "draft") await onDraftFailed(job, new Error("사람이 콘솔에서 초안을 취소")); // 백로그를 다시 승인 대기로 (자동 재집기 없음)
        } else if (e instanceof RetryLater) {
          await requeueJob(job.id);
          log(`↺ ${job.type} ${job.id.slice(0, 8)} 잠시 후 재시도: ${e.message}`);
          await sleep(e.delayMs);
        } else {
          await failJob(job.id, e?.stack ?? String(e));
          log(`✖ ${job.type} ${job.id.slice(0, 8)} 실패: ${e?.message ?? e}`);
          if (job.type === "draft") await onDraftFailed(job, e); // 실패한 초안은 에피소드로 남기지 않고 백로그로 (spec/03 5장)
        }
      } finally {
        clearInterval(hb);
        setJobAbort(null);
        current = null;
      }
      if (once) break;
    } catch (e: any) {
      log(`루프 오류: ${e?.message ?? e}`);
      await sleep(cfg.pollIntervalMs);
    }
  }
  await pool.end();
}

/**
 * 게이트 1 통과(approved) 후보의 폴백 집기 (2026-09-08 개정): 승인 시 UI 가 draft 작업을 큐에 넣는다(spec/10 4장). 여기서는
 * 작업이 없는 approved 후보(Supabase 에디터 승인·개정 전 승인)만 큐에 넣는다. 선점(approved → claimed)은 작업을 시작하는 워커가
 * runDraft 에서 하므로, 두 워커가 같은 후보를 큐에 넣어도 초안은 한 번만 만들어진다 (뒤늦은 쪽은 선점 실패 → 건너뜀).
 */
async function pickupApproved() {
  for (const id of await listApprovedBacklog()) {
    if (await hasActiveDraftJob(id)) continue;
    const jobId = await enqueue({ type: "draft", requires_ai: true, payload: { backlog_id: id, attempt: 1 } });
    log(`게이트 1 승인 감지(폴백): ${id} → draft 작업 ${jobId.slice(0, 8)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
