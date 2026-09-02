import { spawn } from "node:child_process";
import readline from "node:readline";
import type { ExecRequest, ExecResult, Executor, Progress } from "./types.js";

/**
 * 로컬 실행기 — 팀원 본인의 Claude Code 로그인(구독)으로 `claude -p` 를 새 프로세스로 실행한다.
 *
 * - `--bare` 를 쓰지 않는다: bare 는 인증이 ANTHROPIC_API_KEY 전용이라 구독(OAuth)이 막힌다 (2026-08-29 실측).
 *   대신 컨텍스트 반입을 직접 끊는다: --disable-slash-commands · --no-session-persistence · allowedTools · add-dir.
 * - 호출마다 새 프로세스 = 새 컨텍스트 → QA 독립성(spec/05)이 구조적으로 보장된다.
 * - `--output-format stream-json` 으로 실행 중 이벤트를 받아 진행 상황을 보고한다 (마지막 result 이벤트가 최종 결과).
 * - 프롬프트는 stdin 으로 넘긴다 (argv 길이 제한 회피).
 */
export class ClaudeCliExecutor implements Executor {
  readonly kind = "claude-cli" as const;
  constructor(private defaultModel?: string) {}

  run<T>(req: ExecRequest): Promise<ExecResult<T>> {
    const args = [
      "-p",
      "--output-format", "stream-json", "--verbose",
      "--json-schema", JSON.stringify(req.schema),
      "--disable-slash-commands",
      "--no-session-persistence",
      "--permission-mode", "acceptEdits",
      "--allowedTools", req.allowedTools.join(","),
    ];
    for (const d of req.addDirs ?? []) args.push("--add-dir", d);
    const model = req.model ?? this.defaultModel;
    if (model) args.push("--model", model);

    return new Promise((resolve, reject) => {
      const started = Date.now();
      const child = spawn("claude", args, { cwd: req.cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } });
      let err = "";
      let final: any = null;
      const progress: Progress = { detail: "시작 중…", toolCounts: {}, turns: 0, elapsedMs: 0 };
      let lastEmit = 0;
      const emit = (force = false) => {
        const now = Date.now();
        if (!force && now - lastEmit < 4000) return;
        lastEmit = now;
        progress.elapsedMs = now - started;
        req.onProgress?.({ ...progress, toolCounts: { ...progress.toolCounts } });
      };

      const rl = readline.createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        let ev: any;
        try { ev = JSON.parse(line); } catch { return; }
        switch (ev.type) {
          case "rate_limit_event": {
            const u = ev.rate_limit_info?.unifiedWindows;
            progress.rateLimit = { fiveHour: u?.five_hour?.utilization, sevenDay: u?.seven_day?.utilization, resetsAt: u?.five_hour?.resetsAt };
            emit();
            break;
          }
          case "system":
            if (ev.subtype === "init") { progress.detail = "실행 준비"; emit(true); }
            break;
          case "assistant": {
            progress.turns++;
            for (const b of ev.message?.content ?? []) {
              if (b.type === "tool_use") {
                const n = b.name as string;
                progress.toolCounts[n] = (progress.toolCounts[n] ?? 0) + 1;
                progress.lastTool = describeTool(n, b.input);
                progress.detail = req.describe?.(n, b.input, progress.toolCounts) ?? progress.lastTool ?? progress.detail;
              } else if (b.type === "text" && b.text?.trim()) {
                progress.lastText = String(b.text).trim().replace(/\s+/g, " ").slice(0, 160);
              }
            }
            emit();
            break;
          }
          case "result":
            final = ev;
            progress.detail = "마무리";
            emit(true);
            break;
        }
      });
      child.stderr.on("data", (b) => (err += b.toString()));

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 10_000);
      }, req.timeoutMs);

      child.on("error", (e) => { clearTimeout(timer); reject(new Error(`claude 실행 실패: ${e.message}`)); });
      child.on("close", (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - started;
        if (!final) return reject(new Error(`claude -p 결과 없음 (exit ${code}, ${Math.round(durationMs / 1000)}s). stderr: ${err.slice(-800)}`));
        if (final.is_error || final.subtype !== "success") return reject(new Error(`claude -p 오류: ${String(final.result ?? final.subtype).slice(0, 800)}`));
        if (final.structured_output === undefined) return reject(new Error(`structured_output 없음 — 스키마 미준수. result: ${String(final.result).slice(0, 800)}`));
        resolve({
          output: final.structured_output as T,
          model: primaryModel(final.modelUsage),
          sessionId: final.session_id,
          numTurns: final.num_turns,
          durationMs,
          listCostUsd: final.total_cost_usd,
          raw: { usage: final.usage, modelUsage: final.modelUsage, permission_denials: final.permission_denials },
        });
      });
      child.stdin.on("error", () => {});
      child.stdin.write(req.prompt);
      child.stdin.end();
    });
  }
}

function describeTool(name: string, input: any): string {
  switch (name) {
    case "WebFetch": return `원문 읽는 중 — ${hostOf(input?.url ?? "")}`;
    case "Read": return `파일 읽는 중 — ${base(input?.file_path ?? "")}`;
    case "Write": return `${base(input?.file_path ?? "")} 작성`;
    case "Edit": return `${base(input?.file_path ?? "")} 수정`;
    case "Bash": return `검사 실행 — ${String(input?.description ?? input?.command ?? "").slice(0, 50)}`;
    default: return name;
  }
}
const base = (p: string) => p.split("/").filter(Boolean).slice(-1)[0] ?? p;
const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return u.slice(0, 40); } };

function primaryModel(modelUsage: Record<string, { costUSD?: number }> | undefined): string | null {
  if (!modelUsage) return null;
  let best: string | null = null;
  let bestCost = -1;
  for (const [m, u] of Object.entries(modelUsage)) {
    if (m.includes("haiku")) continue;
    const c = u.costUSD ?? 0;
    if (c > bestCost) { bestCost = c; best = m; }
  }
  return best ?? Object.keys(modelUsage)[0] ?? null;
}
