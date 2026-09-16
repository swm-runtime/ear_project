import { enqueue, type Job, type JobType } from "./db.js";
import { log } from "./util.js";

/**
 * 발행 준비 연쇄 (KAN-50 1·3번) — `tts → thumbnail → package`.
 *
 * **남은 단계를 payload 에 배열로 들고 다닌다**(`chain: ["thumbnail","package"]`). 단계마다
 * "다음이 뭔지"를 코드로 분기하지 않기 위해서다 — 분기를 두면 시작 지점이 다른 세 버튼
 * ([발행 준비] · [음원 다시 변환] · [썸네일 다시 만들기])이 각자 다른 경로를 타게 되고,
 * 그중 하나만 고쳐지는 일이 생긴다. 시작하는 쪽이 배열을 정하고 단계는 앞에서 하나씩 꺼낼 뿐이다.
 *
 *   [발행 준비]          tts        chain: ["thumbnail", "package"]
 *   [음원 다시 변환]      tts(force) chain: ["package"]              ← 썸네일은 건드리지 않는다
 *   [썸네일 다시 만들기]  thumbnail  chain: ["package"]
 *
 * **실패하면 연쇄가 멈춘다.** 실패한 작업은 `failJob` 으로 남고 다음이 큐에 들어가지 않는다 —
 * 오디오가 없는데 패키지가 도는 것 같은 상태를 만들지 않기 위해서다(티켓 3번).
 */

/** 연쇄에 들어가는 단계는 전부 io 전용이다 — 구독 토큰이 필요한 AI 작업이 섞이지 않는다 */
const CHAIN_TYPES: readonly JobType[] = ["tts", "thumbnail", "package"];

export function chainOf(job: Job): JobType[] {
  const raw = job.payload.chain;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is JobType => typeof t === "string" && CHAIN_TYPES.includes(t as JobType));
}

/**
 * 다음 단계를 큐에 넣는다. 남은 단계가 없으면 아무것도 하지 않고 `null`.
 *
 * `force` 는 전달하지 않는다 — 강제 재실행은 **사람이 누른 그 단계에만** 적용된다.
 * 연쇄로 따라오는 단계까지 강제하면 [음원 다시 변환]이 썸네일까지 다시 뽑아 과금된다.
 */
export async function advanceChain(job: Job): Promise<{ type: JobType; id: string } | null> {
  const [next, ...rest] = chainOf(job);
  if (!next) return null;

  const id = await enqueue({
    type: next,
    requires_ai: false,
    payload: {
      episode_id: job.payload.episode_id,
      backlog_id: job.payload.backlog_id,
      chain: rest,
    },
    parent_job_id: job.id,
  });
  log(`  연쇄: ${job.type} → ${next} ${id.slice(0, 8)}${rest.length ? ` (남은 단계 ${rest.join(" → ")})` : ""}`);
  return { type: next, id };
}
