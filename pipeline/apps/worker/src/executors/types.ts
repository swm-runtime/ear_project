export interface Progress {
  /** 사람이 읽는 한 줄 — 예: "소스 정독 5/7" */
  detail: string;
  toolCounts: Record<string, number>;
  lastTool?: string;
  lastText?: string;
  turns: number;
  elapsedMs: number;
  /** 구독 사용량 (5시간 창·7일 창 활용률 0~1) — 워커 실행자의 한도 소진을 보이게 */
  rateLimit?: { fiveHour?: number; sevenDay?: number; resetsAt?: number };
}

export interface ExecRequest {
  prompt: string;
  /** JSON Schema — 결과는 반드시 이 형식 (claude -p --json-schema / API structured output) */
  schema: object;
  /** 허용 도구 규칙 (Claude Code 권한 규칙 문법: "Read", "Write(episodes/T…/**)", "WebFetch(domain:example.com)", "Bash(python3 *)") */
  allowedTools: string[];
  /** 도구 접근 허용 디렉토리 (cwd 외) */
  addDirs?: string[];
  cwd: string;
  timeoutMs: number;
  model?: string;
  /** 진행 상황 콜백 — 실행기가 스트림 이벤트를 요약해 호출 (워커가 jobs.progress 에 기록) */
  onProgress?: (p: Progress) => void;
  /** 도구 호출을 사람이 읽는 문구로 바꾸는 단계별 라벨러 */
  describe?: (toolName: string, input: any, counts: Record<string, number>) => string | null;
}

export interface ExecResult<T = unknown> {
  output: T;
  model: string | null;
  sessionId?: string;
  numTurns?: number;
  durationMs: number;
  /** 구독 실행 시엔 참고값(정가 환산) */
  listCostUsd?: number;
  raw?: unknown;
}

export interface Executor {
  readonly kind: "claude-cli" | "api" | "none";
  run<T>(req: ExecRequest): Promise<ExecResult<T>>;
}
