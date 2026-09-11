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
/** 정수 env — 빈 값이면 기본, "none" 이면 상한 없음(undefined) */
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
function envEffort(key: string, dflt: Effort | null): Effort | undefined {
  const v = process.env[key];
  if (v === undefined || v === "") return dflt ?? undefined;
  if (v === "none" || v === "default") return undefined;
  if (["low", "medium", "high", "xhigh", "max"].includes(v)) return v as Effort;
  throw new Error(`${key}=${v} — low|medium|high|xhigh|max|none 중 하나`);
}
function envInt(name: string, dflt: number | null): number | undefined {
  const v = process.env[name];
  if (v == null || v === "") return dflt ?? undefined;
  if (v === "none") return undefined;
  const n = Number(v); return Number.isFinite(n) ? n : dflt ?? undefined;
}
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
  /** 초안 방식 (2026-09-08 — "축이 이끄는 파이프라인" ③): two-stage = 설계(원문 정독·발췌·claims·구성안) → 대본(원문 없이, 단발 호출).
   *  single = 구 방식(한 실행이 정독부터 대본까지). 비교 측정용 토글 — DRAFT_MODE=single 로 되돌린다 */
  draftMode: (process.env.DRAFT_MODE === "single" ? "single" : "two-stage") as "single" | "two-stage",
  /** 2단계 단계별 모델 — 미설정이면 CLAUDE_MODEL(=CLI 기본). 설계는 정독·구조 판단, 대본은 문장이라 따로 둘 수 있게 */
  draftDesignModel: process.env.DRAFT_DESIGN_MODEL || "claude-opus-5", // 설계(구조·발췌 선택)는 opus 단발이 Fable 에이전트($5.45)의 절반 이하($2.26)로 같은 수준의 구성안을 냈다 (2026-09-08 C50)
  /** 수정 재생성 형태 (2026-09-09): single = 인라인·도구 없음·바꿀 턴만 받아 워커가 치환 · agent = 구 방식(Read·Edit 루프). 기본 agent — 판정 3편 동안 현행 유지, 이후 single 로 */
  revisionMode: (process.env.REVISION_MODE === "agent" ? "agent" : "single") as "single" | "agent", // 2026-09-10 기본 single (판정 3편 완료 후 전환 — 스모크 $1.92 → $0.89). 되돌리려면 REVISION_MODE=agent
  revisionModel: process.env.REVISION_MODEL || process.env.DRAFT_WRITE_MODEL || "claude-opus-5",
  thinkingRevision: envInt("THINKING_REVISION", 4000),
  /** 설계 실행 형태 (2026-09-08 비용 절감 ③): single(기본) = 소스 본문을 코드가 가져와 인라인, 도구 없음, 발췌는 ID 선택 · agent = WebFetch·파일 쓰기 루프. DESIGN_MODE=agent 로 복귀 */
  designMode: (process.env.DESIGN_MODE === "agent" ? "agent" : "single") as "single" | "agent",
  draftWriteModel: process.env.DRAFT_WRITE_MODEL || "claude-opus-5", // 2026-09-08 박수헌: 판정용 3편을 opus-5 로 만들어 사람 판정으로 확정 (Fable 대본 ≈$4.5 → opus ≈$2). 되돌리려면 DRAFT_WRITE_MODEL=claude-fable-5-1
  /** 비평 전용 모델 — 2026-09-01 박수헌: 비평은 Opus 고정 (Fable 한도 부족). 판정자 모델은 회귀 세트 재검증 트리거이므로 바꾸면 spec/09 7.4 */
  criticModel: process.env.CRITIC_MODEL || "claude-opus-5",
  /** QA 통과 연쇄가 큐에 넣는 비평 루브릭 (spec/09 7.1 — 회귀 세트 판정은 critic-v2 배점으로, v1 5축에 사람 시간을 쓰지 않는다). 2026-09-07 기본 v2. 되돌리려면 CRITIC_RUBRIC=v1 */
  criticRubric: (process.env.CRITIC_RUBRIC === "v1" ? "v1" : "v2") as "v1" | "v2",
  /** QA·군집화 모델 — 2026-09-03 박수헌: 발췌 대조·구조 분석은 Fable 이 필요 없다 → Opus 기본 (속도·한도 절약). QA 도 평가자라 바꾸면 spec/09 7.4 */
  /** QA 모델 — 2026-09-08 Sonnet 5 기본 (비용 절감 ⑤): 심은 오류 프로브 8건 중 7건 검출·오탐 0(opus 상한판 8/8). 놓친 1건(시점 고정 표현)은 L0 코드 검사로 이관. 되돌리려면 QA_MODEL=claude-opus-5 */
  qaModel: process.env.QA_MODEL || "claude-sonnet-5",
  /** 추천 메타 판정 (KAN-53) — 판정 5종은 분류 작업이라 Sonnet 으로 충분. 편당 $0.1~0.3 */
  enrichModel: process.env.ENRICH_MODEL || "claude-sonnet-5",
  /** QA 실행 형태 (2026-09-08 비용 절감 ②): single = 입력 인라인·도구 없음·리포트는 JSON 으로(기본) · agent = 구 방식(파일 읽기·리포트 쓰기 루프). QA_MODE=agent 로 복귀 */
  qaMode: (process.env.QA_MODE === "agent" ? "agent" : "single") as "single" | "agent",
  /** 단계별 생각 토큰 상한 (2026-09-08 비용 절감 ④). 비우면 모델 기본. 판정·대조(QA·비평·설계)는 상한을 걸어도 판정이 유지됨을 실측 후 기본값을 둔다 */
  thinkingQa: envInt("THINKING_QA", 6000),
  thinkingDesign: envInt("THINKING_DESIGN", 8000),
  thinkingWrite: envInt("THINKING_WRITE", 8000), // 2026-09-09: 상한 없는 opus 대본이 30분 제한을 넘겨 강제 종료(T260908-002). 시간을 묶는 용도
  thinkingCritic: envInt("THINKING_CRITIC", null),
  /** 설계·대본 effort (2026-09-09): opus-5 는 적응형 생각이라 MAX_THINKING_TOKENS 를 무시한다(상한 8000 인데 대본 3.6만~14.5만 실측). `claude --effort` 만 듣는다.
   *  T260909-004 대본 실측 — high $2.02·생각 3.6만·11분 → medium $1.63·1.4만·7분(QA 1회 통과) → low $1.35·0.5만·4분(QA 실패 3: 필수 한계 누락·미근거). 기본 medium. 비우면 CLI 기본(high) */
  effortDesign: envEffort("EFFORT_DESIGN", "medium"),
  effortWrite: envEffort("EFFORT_WRITE", "medium"), // 비평은 회귀 세트로 편향을 재는 중 — 상한은 재검증(spec/09 7.4) 후에 (기본 없음)
  clusterModel: process.env.CLUSTER_MODEL || "claude-opus-5",
  /** 군집화 방식 (2026-09-09 ①): v2 = 축 먼저·역할·다양성(단발) · v1 = 유사성 묶기(현행, 기본). ③ 판정 3편 후 v2 로 전환 */
  clusterMode: (process.env.CLUSTER_MODE === "v2" ? "v2" : "v1") as "v1" | "v2",
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
  // 화자별 배속 (spec/06 6장) — 다중화자 1콜은 속도 설정이 없어 타임스탬프 정렬 후 ffmpeg atempo 로 후처리한다. 1 이면 원속.
  ttsSpeedYuna: process.env.TTS_SPEED_YUNA ? Number(process.env.TTS_SPEED_YUNA) : 1.2, // 2026-09-07 박수헌: 윤아 보이스가 느려 1.2
  ttsSpeedEum: process.env.TTS_SPEED_EUM ? Number(process.env.TTS_SPEED_EUM) : 1,
  /** TTS 비용 환산용 1천 자당 USD — eleven_v3 API 종량 단가 $0.10/1천 자 (2026-09 ElevenLabs, v2/v3 공통·1자=1크레딧. Flash/Turbo 는 $0.05).
   *  LLM 정가 환산과 달리 이건 실제 종량 요금이다. 요금제/모델 바뀌면 TTS_USD_PER_1K_CHARS 로 덮는다 */
  ttsUsdPer1kChars: process.env.TTS_USD_PER_1K_CHARS ? Number(process.env.TTS_USD_PER_1K_CHARS) : 0.1,

  /** 썸네일 (KAN-50) — OpenAI 이미지 API. 키는 서버 env.prod 에만 두고 코드·.env.example 에 실값을 넣지 않는다 */
  openaiKey: process.env.OPENAI_API_KEY || "",
  /**
   * **gpt-image-2 확정** (2026-09-10 박수헌 — mini 와 같은 에피소드로 뽑아 비교한 뒤).
   * 티켓의 열린 항목("mini 가 앵커 화풍을 얼마나 따르는지 첫 5편 실측 후 확정")을 닫은 값이다.
   *
   * mini 가 3배 싸고 20초 빠르지만(실측 25.6초 vs 45.3초) 채택 기준이 **"품질보다 콘텐츠마다
   * 일정하게"** 라, 값싼 쪽이 아니라 화풍이 일정한 쪽을 고른다 — 썸네일은 목록에 여러 장이
   * 나란히 붙어 나오므로 편마다 화풍이 튀면 한 장 한 장이 좋아도 화면이 무너진다.
   * 월 100편에 약 $3.
   */
  thumbnailModel: process.env.THUMBNAIL_MODEL || "gpt-image-2",
  /** low | medium | high — 정가 차이가 크다(mini: 0.005 / 0.009 / 0.052). 기본 medium */
  thumbnailQuality: process.env.THUMBNAIL_QUALITY || "medium",
  /** 1:1 고정 (프롬프트 자산 [규격]) — 44pt 미니 플레이어까지 한 장으로 쓴다 */
  thumbnailSize: process.env.THUMBNAIL_SIZE || "1024x1024",
  /**
   * 스타일 앵커 (선택) — WORK_ROOT 상대 키. 이미지 API 에는 seed 가 없어 같은 프롬프트도 매번 화풍이 달라진다.
   * 운영자가 첫 3~5편 중 1장을 골라 지정하면 이후 생성은 images/edits 로 그 그림을 참조해 화풍을 맞춘다.
   * 비어 있으면 참조 없이 생성한다(초기 5편이 이 경로다).
   */
  thumbnailAnchorKey: process.env.THUMBNAIL_ANCHOR_KEY || "",
  /** 1장당 USD — runs.cost_usd 환산용. 모델·품질을 바꾸면 THUMBNAIL_USD_PER_IMAGE 로 덮는다 */
  thumbnailUsdPerImage: process.env.THUMBNAIL_USD_PER_IMAGE ? Number(process.env.THUMBNAIL_USD_PER_IMAGE) : undefined,
};

export const canAi = cfg.capabilities.includes("ai") && cfg.executor !== "none";
/** TTS 를 집을 수 있는가 = ElevenLabs 키 보유 (spec/06). 키 없는 노트북 워커는 TTS 를 큐에 남겨 서버가 집게 한다 (0010) */
export const canTts = !!cfg.elevenLabsKey;
/** 썸네일을 집을 수 있는가 = OpenAI 키 보유 (0018). 키 없는 워커는 큐에 남겨 서버가 집게 한다 — TTS 와 같은 이유 */
export const canThumbnail = !!cfg.openaiKey;
export const executedBy = `worker:${cfg.workerName} (${cfg.executor})`;
