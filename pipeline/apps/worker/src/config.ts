import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ExecutorKind = "claude-cli" | "api" | "none";
export type Capability = "ai" | "io";

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 이(가) 없습니다 (apps/worker/.env 참조)`);
  return v;
}

const here = path.dirname(fileURLToPath(import.meta.url));

export const cfg = {
  databaseUrl: must("DATABASE_URL"),
  /** 자산 원본 루트 — 기본: 레포의 docs/ai. 규칙 자산 7개의 진실은 DB(prompt_assets)이고, 여기서는 spec/03·04·05 와 시딩 원본(assets:import)만 읽는다 (spec/10 3.2) */
  assetSourceRoot: process.env.ASSET_ROOT || path.resolve(here, "..", "..", "..", "..", "docs", "ai"),
  /** 산출물 작업 루트 — episodes/·sources/sweeps/ 를 여기에 쓴다. `claude -p` 의 cwd 이기도 하다: 레포 안이면 루트 CLAUDE.md·.claude/ 가
   *  생성 컨텍스트에 섞이므로 레포 밖(기본 pipeline/.work, gitignore)에 둔다. 구 REPO_ROOT 는 호환용 (전환기: 기존 로컬 산출물 폴더) */
  workRoot: process.env.WORK_ROOT || process.env.REPO_ROOT || path.resolve(here, "..", "..", "..", ".work"),
  workerName: process.env.WORKER_NAME || `${os.userInfo().username}@${os.hostname()}`,
  executor: (process.env.EXECUTOR || "claude-cli") as ExecutorKind,
  capabilities: (process.env.CAPABILITIES || "ai,io").split(",").map((s) => s.trim()) as Capability[],
  claudeModel: process.env.CLAUDE_MODEL || undefined,
  /** 비평 전용 모델 — 2026-09-01 박수헌: 비평은 Opus 고정 (Fable 한도 부족). 판정자 모델은 회귀 세트 재검증 트리거이므로 바꾸면 spec/09 7.4 */
  criticModel: process.env.CRITIC_MODEL || "claude-opus-5",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
  /** 파일럿 예외 (spec/02 2장): 계층 판정 전에는 candidate 도메인도 스윕한다. 판정이 쌓이면 false 로. */
  pilotSweepCandidates: (process.env.PILOT_SWEEP_CANDIDATES ?? "true") === "true",
};

export const canAi = cfg.capabilities.includes("ai") && cfg.executor !== "none";
export const executedBy = `worker:${cfg.workerName} (${cfg.executor})`;
