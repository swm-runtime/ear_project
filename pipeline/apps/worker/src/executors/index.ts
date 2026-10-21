import type { Executor, ExecRequest, ExecResult, Progress } from "./types.js";
import { ClaudeCliExecutor } from "./claude-cli.js";
import { OpenAiExecutor } from "./openai-api.js";
import { OpenAiSearchExecutor } from "./openai-search.js";
import type { ExecutorKind } from "../config.js";

class NoneExecutor implements Executor {
  readonly kind = "none" as const;
  async run<T>(_req: ExecRequest): Promise<ExecResult<T>> {
    throw new Error("이 워커는 AI 실행기가 없습니다 (EXECUTOR=none) — AI 작업을 집지 않아야 합니다");
  }
}

/** API 실행기 자리 — Anthropic SDK 이식은 미결 #12(비용 합의) 후. 지금은 명시적으로 비활성. */
class ApiExecutor implements Executor {
  readonly kind = "api" as const;
  async run<T>(_req: ExecRequest): Promise<ExecResult<T>> {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("EXECUTOR=api 이지만 ANTHROPIC_API_KEY 가 없습니다");
    throw new Error("API 실행기는 아직 이식 전입니다 (spec/10 2장 — 미결 #12 후 활성)");
  }
}

export { setJobAbort, jobAbortSignal } from "./abort.js";

/**
 * 모델 이름으로 실행기를 고르는 라우터 (2026-09-19): 기본 실행기(claude-cli)에서 단계 env 가 `gpt-…` 모델이면 그 호출만 OpenAI 로 보낸다.
 * 같은 워커에서 초안(설계·대본·수정)은 GPT, QA·비평은 Claude 로 두는 짝 비교가 이걸로 된다 — 예: DRAFT_DESIGN_MODEL=gpt-5.6-sol DRAFT_WRITE_MODEL=gpt-5.6-sol npm run worker
 */
class RoutedExecutor implements Executor {
  readonly kind = "claude-cli" as const;
  private openai = new OpenAiExecutor();
  constructor(private cli: ClaudeCliExecutor) {}
  run<T>(req: ExecRequest): Promise<ExecResult<T>> {
    if (/^(gpt-|o\d)/.test(req.model ?? "")) return this.openai.run<T>(req);
    return this.cli.run<T>(req);
  }
}

export function makeExecutor(kind: ExecutorKind, model?: string): Executor {
  switch (kind) {
    case "claude-cli": return new RoutedExecutor(new ClaudeCliExecutor(model));
    case "api": return new ApiExecutor();
    case "openai": return new OpenAiSearchExecutor(model); // 단발 호출 + 웹 검색(WebSearch 만 쓰는 요청). 2026-10-15 KAN-209 글로벌판에 붙이고, 2026-10-16 KAN-222 한국판도 같은 실행기 — 보강·주제 기획을 서버 워커가 집는다
    default: return new NoneExecutor();
  }
}
/**
 * 이 실행기가 도구 작업(sweep 모드 B 보강·B2 주제 기획 — WebSearch 만 쓰는 검색 단계)을 처리할 수 있는가 (0025 claim_job p_can_tools).
 * claude-cli 는 WebSearch 도구, openai 는 OpenAI 웹 검색(executors/openai-search.ts). api(미이식)·none(IO 전용)은 못 한다.
 * 2026-10-16 KAN-222: 종전 조건은 "openai 가 아니거나 en 인스턴스"였다 — 언어가 아니라 실행기 능력으로 묶는다.
 */
export function executorHandlesWebSearch(kind: ExecutorKind): boolean {
  return kind === "claude-cli" || kind === "openai";
}
export type { Executor, ExecRequest, ExecResult, Progress };
