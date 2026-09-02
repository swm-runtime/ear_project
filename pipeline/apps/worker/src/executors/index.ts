import type { Executor, ExecRequest, ExecResult, Progress } from "./types.js";
import { ClaudeCliExecutor } from "./claude-cli.js";
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

export function makeExecutor(kind: ExecutorKind, model?: string): Executor {
  switch (kind) {
    case "claude-cli": return new ClaudeCliExecutor(model);
    case "api": return new ApiExecutor();
    default: return new NoneExecutor();
  }
}
export type { Executor, ExecRequest, ExecResult, Progress };
