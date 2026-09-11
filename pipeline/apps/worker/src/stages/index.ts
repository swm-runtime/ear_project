import type { Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { runSweep } from "./sweep.js";
import { runReinforce } from "./reinforce.js";
import { runCluster } from "./cluster.js";
import { runDraft } from "./draft.js";
import { runQa } from "./qa.js";
import { runCritic, runCriticMeasure } from "./critic.js";
import { runDomainCheck } from "./domain-check.js";
import { runTts } from "./tts.js";
import { runPackage } from "./package.js";
import { runThumbnail } from "./thumbnail.js";
import { runEnrich } from "./enrich.js";

export async function runStage(job: Job, ex: Executor): Promise<unknown> {
  switch (job.type) {
    case "sweep": return job.payload.mode === "B" ? runReinforce(job, ex) : runSweep(job); // 모드 B-① 보강 (0019): AI 실행기(WebSearch) 필요 — requires_ai=true 로 넣는다
    case "cluster": return runCluster(job, ex);
    case "draft": return runDraft(job, ex);
    case "qa": return runQa(job, ex);
    case "critic": return runCritic(job, ex);
    case "critic_measure": return runCriticMeasure(job, ex);
    case "enrich": return runEnrich(job, ex); // 추천 메타 부여 (KAN-53, 0021) — 산출물만 만든다. 제품 반영은 콘솔이 브라우저 세션으로 // 루브릭 개정안 측정 (0020) — 리포트를 따로 쓰고 에피소드 행은 건드리지 않는다
    case "domain_check": return runDomainCheck(job); // IO 전용 — AI 실행기 불필요
    case "tts": return runTts(job);       // IO 전용 — ElevenLabs (spec/06). 수동 트리거만
    case "thumbnail": return runThumbnail(job); // IO 전용 — OpenAI 이미지 API (KAN-50). 키 있는 워커만 집는다(0018)
    case "package": return runPackage(job); // IO 전용 — upload-meta.json (spec/07 2장). 수동 트리거만
    default: throw new Error(`알 수 없는 작업 유형: ${(job as Job).type}`);
  }
}
