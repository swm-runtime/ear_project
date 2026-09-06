import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ExecutorKind = "claude-cli" | "api" | "none";
export type Capability = "ai" | "io";
export type StorageMode = "direct" | "web";

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 이(가) 없습니다 (apps/worker/.env 참조)`);
  return v;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const webUrl = (process.env.PIPELINE_WEB_URL || "").replace(/\/+$/, "");

export const cfg = {
  databaseUrl: must("DATABASE_URL"),
  /** 자산 원본 루트 — 기본: 레포의 docs/ai. 규칙 자산 7개의 진실은 DB(prompt_assets)이고, 여기서는 spec/03·04·05 와 시딩 원본(assets:import)만 읽는다 (spec/10 3.2) */
  assetSourceRoot: process.env.ASSET_ROOT || path.resolve(here, "..", "..", "..", "..", "docs", "ai"),
  /** 산출물 작업 루트 — S3 의 로컬 캐시 (episodes/·sweeps/·assets/). `claude -p` 의 cwd 이기도 하다: 레포 안이면 루트 CLAUDE.md·.claude/ 가
   *  생성 컨텍스트에 섞이므로 레포 밖(기본 pipeline/.work, gitignore)에 둔다. 원본은 S3 (storage.ts) — 지워도 다음 단계가 다시 내려받는다. 구 REPO_ROOT 는 호환용 */
  workRoot: process.env.WORK_ROOT || process.env.REPO_ROOT || path.resolve(here, "..", "..", "..", ".work"),
  workerName: process.env.WORKER_NAME || `${os.userInfo().username}@${os.hostname()}`,
  executor: (process.env.EXECUTOR || "claude-cli") as ExecutorKind,
  capabilities: (process.env.CAPABILITIES || "ai,io").split(",").map((s) => s.trim()) as Capability[],
  /** 대본 생성 모델 — 미설정이면 claude CLI 기본 모델(현재 Fable). 생성 품질이 제품이라 최상위 모델을 쓴다. 바꾸면 spec/09 7.4(생성 대개정) 재검증 */
  claudeModel: process.env.CLAUDE_MODEL || undefined,
  /** 비평 전용 모델 — 2026-09-01 박수헌: 비평은 Opus 고정 (Fable 한도 부족). 판정자 모델은 회귀 세트 재검증 트리거이므로 바꾸면 spec/09 7.4 */
  criticModel: process.env.CRITIC_MODEL || "claude-opus-5",
  /** QA·군집화 모델 — 2026-09-03 박수헌: 발췌 대조·구조 분석은 Fable 이 필요 없다 → Opus 기본 (속도·한도 절약). QA 도 평가자라 바꾸면 spec/09 7.4 */
  qaModel: process.env.QA_MODEL || "claude-opus-5",
  clusterModel: process.env.CLUSTER_MODEL || "claude-opus-5",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
  /** 파일럿 예외 (spec/02 2장): 계층 판정 전에는 candidate 도메인도 스윕한다. 판정이 쌓이면 false 로. */
  pilotSweepCandidates: (process.env.PILOT_SWEEP_CANDIDATES ?? "true") === "true",
  /** 산출물 저장소 (spec/10 3.3): direct = AWS SDK 직접(EC2 인스턴스 역할, 개발 중엔 AWS_PROFILE) · web = 웹 `/api/storage` 서명 URL(팀원 노트북 — AWS 키 없음).
   *  S3_MODE 를 비우면 PIPELINE_WEB_URL 이 있을 때 web, 없으면 direct */
  storageMode: (process.env.S3_MODE || (webUrl ? "web" : "direct")) as StorageMode,
  bucket: process.env.PIPELINE_BUCKET || "",
  awsRegion: process.env.AWS_REGION || "ap-northeast-2",
  webUrl,
  workerToken: process.env.PIPELINE_WORKER_TOKEN || "",
  /** TTS (spec/06) — 보이스는 채널 아이덴티티: 확정·고정 (2026-09-02 박수헌 — 윤아=Annie, 이음=Yohan Koo). 변경은 리브랜딩급 결정 */
  elevenLabsKey: process.env.ELEVENLABS_API_KEY || "",
  ttsModel: process.env.TTS_MODEL || "eleven_v3",
  ttsVoiceYuna: process.env.TTS_VOICE_YUNA || "Lb7qkOn5hF8p7qfCDH8q",
  ttsVoiceEum: process.env.TTS_VOICE_EUM || "4JJwo477JUAx3HV0T7n7",
  /** TTS 비용 환산용 1천 자당 USD — eleven_v3 API 종량 단가 $0.10/1천 자 (2026-09 ElevenLabs, v2/v3 공통·1자=1크레딧. Flash/Turbo 는 $0.05).
   *  LLM 정가 환산과 달리 이건 실제 종량 요금이다. 요금제/모델 바뀌면 TTS_USD_PER_1K_CHARS 로 덮는다 */
  ttsUsdPer1kChars: process.env.TTS_USD_PER_1K_CHARS ? Number(process.env.TTS_USD_PER_1K_CHARS) : 0.1,
};

export const canAi = cfg.capabilities.includes("ai") && cfg.executor !== "none";
/** TTS 를 집을 수 있는가 = ElevenLabs 키 보유 (spec/06). 키 없는 노트북 워커는 TTS 를 큐에 남겨 서버가 집게 한다 (0010) */
export const canTts = !!cfg.elevenLabsKey;
export const executedBy = `worker:${cfg.workerName} (${cfg.executor})`;
