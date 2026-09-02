import type { Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { runSweep } from "./sweep.js";
import { runCluster } from "./cluster.js";
import { runDraft } from "./draft.js";
import { runQa } from "./qa.js";
import { runCritic } from "./critic.js";
import { runDomainCheck } from "./domain-check.js";
import { runTts } from "./tts.js";
import { runPackage } from "./package.js";

export async function runStage(job: Job, ex: Executor): Promise<unknown> {
  switch (job.type) {
    case "sweep": return runSweep(job);
    case "cluster": return runCluster(job, ex);
    case "draft": return runDraft(job, ex);
    case "qa": return runQa(job, ex);
    case "critic": return runCritic(job, ex);
    case "domain_check": return runDomainCheck(job); // IO 전용 — AI 실행기 불필요
    case "tts": return runTts(job);       // IO 전용 — ElevenLabs (spec/06). 수동 트리거만
    case "package": return runPackage(job); // IO 전용 — upload-meta.json (spec/07 2장). 수동 트리거만
    default: throw new Error(`알 수 없는 작업 유형: ${(job as Job).type}`);
  }
}
