import type { Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { runSweep } from "./sweep.js";
import { runCluster } from "./cluster.js";
import { runDraft } from "./draft.js";
import { runQa } from "./qa.js";
import { runCritic } from "./critic.js";
import { runDomainCheck } from "./domain-check.js";

export async function runStage(job: Job, ex: Executor): Promise<unknown> {
  switch (job.type) {
    case "sweep": return runSweep(job);
    case "cluster": return runCluster(job, ex);
    case "draft": return runDraft(job, ex);
    case "qa": return runQa(job, ex);
    case "critic": return runCritic(job, ex);
    case "domain_check": return runDomainCheck(job); // IO 전용 — AI 실행기 불필요
    case "tts": throw new Error("tts 단계는 M5에서 구현 (ElevenLabs) — 수동 트리거 전용");
    case "package": throw new Error("package 단계는 M5에서 구현");
    default: throw new Error(`알 수 없는 작업 유형: ${(job as Job).type}`);
  }
}
