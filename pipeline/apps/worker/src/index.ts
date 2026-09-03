import fs from "node:fs/promises";
import { cfg, canAi, canTts, executedBy } from "./config.js";
import { claimApprovedBacklog, claimJob, enqueue, failJob, finishJob, heartbeat, listApprovedBacklog, pool, requeueJob, startJob } from "./db.js";
import { workerRev } from "./assets.js";
import { probeStorage } from "./storage.js";
import { makeExecutor } from "./executors/index.js";
import { runStage } from "./stages/index.js";
import { log, sleep, RetryLater } from "./util.js";

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
    const requiresAi = !["sweep", "tts", "package"].includes(type);
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
  log(`워커 시작 — ${executedBy} · capabilities=${cfg.capabilities.join(",")} · AI=${canAi ? "on" : "off"} · TTS=${canTts ? "on" : "off(키 없음 — 서버가 집음)"} · assets=DB+${cfg.assetSourceRoot} · work=${cfg.workRoot} · storage=${storageInfo} · rev=${workerRev()}`);

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

  while (true) {
    try {
      if (canAi) await pickupApproved();
      const job = await claimJob(cfg.workerName, canAi, canTts);
      if (!job) {
        if (once) { log("대기 중인 작업 없음"); break; }
        if (drain && (await listApprovedBacklog()).length === 0) { log("큐 비움 — drain 종료"); break; }
        await sleep(cfg.pollIntervalMs);
        continue;
      }
      current = job.id;
      log(`▶ ${job.type} ${job.id.slice(0, 8)} attempt ${job.attempt}`, job.payload);
      await startJob(job.id);
      const hb = setInterval(() => heartbeat(job.id).catch(() => {}), 30_000);
      try {
        const result = await runStage(job, ex);
        await finishJob(job.id, result);
        log(`✔ ${job.type} ${job.id.slice(0, 8)} 완료`);
      } catch (e: any) {
        if (e instanceof RetryLater) {
          await requeueJob(job.id);
          log(`↺ ${job.type} ${job.id.slice(0, 8)} 잠시 후 재시도: ${e.message}`);
          await sleep(e.delayMs);
        } else {
          await failJob(job.id, e?.stack ?? String(e));
          log(`✖ ${job.type} ${job.id.slice(0, 8)} 실패: ${e?.message ?? e}`);
        }
      } finally {
        clearInterval(hb);
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

/** 게이트 1 통과(approved) 후보 → draft 작업 생성 + claimed 전환 (집기). UI 는 approved 전환만 한다 (spec/08 4장). */
async function pickupApproved() {
  for (const id of await listApprovedBacklog()) {
    // 먼저 선점(approved → claimed, 원자적) — 다른 워커가 이미 집었으면 건너뛴다. 예전 순서(작업 생성 → 전환)는 draft 를 두 번 만들었다
    if (!(await claimApprovedBacklog(id, cfg.workerName))) continue;
    const jobId = await enqueue({ type: "draft", requires_ai: true, payload: { backlog_id: id, attempt: 1 } });
    log(`게이트 1 승인 감지: ${id} → draft 작업 ${jobId.slice(0, 8)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
