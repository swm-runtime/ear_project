import { jobAbortSignal } from "./abort.js";
import type { ExecRequest, ExecResult, Executor, Progress } from "./types.js";

/**
 * OpenAI 실행기 (실험, 2026-09-19 박수헌: "API 전환 비용 절감 확인 + GPT 로 바꿨을 때 대본 차이 확인").
 * - `EXECUTOR=openai`. 키는 썸네일과 같은 OPENAI_API_KEY. Responses API 직접 호출(SDK 없음) + 구조화 출력(json_schema strict).
 * - **단발 호출만** 지원한다(tools: []). 설계·대본·수정·QA·비평·군집화 v2 가 전부 단발이라 전 단계를 덮고, 도구가 필요한 작업(보강 스윕 WebSearch)은 거절한다.
 * - 단계 env(DRAFT_WRITE_MODEL 등)가 claude 이름이면 동급 GPT 로 사상한다(아래 MODEL_MAP — 단가 기준 동급: opus-5 $5/$25 ↔ gpt-5.6-sol $4/$20,
 *   sonnet-5 ↔ gpt-5.6-terra $2/$12, fable-5-1 $10/$50 ↔ gpt-6-astra $10/$50, haiku ↔ gpt-5.6-luna). gpt- 로 시작하면 그대로 쓴다.
 * - 프롬프트 캐시는 OpenAI 가 자동(앞부분 동일 접두사) — 시스템 프롬프트(규칙·골드)를 첫 메시지로 보내 캐시가 걸리게 한다. 비용은 usage × 단가표(2026-09-19 docs 기준)로 환산해 runs.cost_usd 에 남긴다.
 * - raw.usage 는 claude 형식(cache_read_input_tokens · output_tokens_details.thinking_tokens)으로 맞춰 기존 비용 분석 스크립트가 그대로 읽게 한다.
 */
const MODEL_MAP: Record<string, string> = {
  "claude-opus-5": process.env.OPENAI_MODEL_OPUS || "gpt-5.6-sol",
  "claude-sonnet-5": process.env.OPENAI_MODEL_SONNET || "gpt-5.6-terra",
  "claude-fable-5-1": process.env.OPENAI_MODEL_FABLE || "gpt-6-astra",
  "claude-haiku-4-5-20251001": process.env.OPENAI_MODEL_HAIKU || "gpt-5.6-luna",
};
/** $/M tokens — input · cached input · output (developers.openai.com/api/docs/pricing, 2026-09-19. sol 은 11/21 까지 프로모션가) */
const PRICE: Record<string, [number, number, number]> = {
  "gpt-6-astra": [10, 1, 50], "gpt-5.6-sol": [4, 0.4, 20], "gpt-5.6-terra": [2, 0.2, 12], "gpt-5.6-luna": [0.2, 0.02, 1.2],
  "gpt-5.4": [2.5, 0.25, 15], "gpt-5.4-mini": [0.75, 0.075, 4.5], "gpt-5.4-nano": [0.2, 0.02, 1.25],
  "gpt-5.1": [1.25, 0.125, 10], "gpt-5": [1.25, 0.125, 10], "gpt-5-mini": [0.25, 0.025, 2], "gpt-5-nano": [0.05, 0.005, 0.4],
};
const EFFORT: Record<string, string> = { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };

export function mapOpenAiModel(model?: string): string {
  const m = model ?? "";
  if (!m) return MODEL_MAP["claude-opus-5"];
  if (/^(gpt-|o\d)/.test(m)) return m;
  for (const [k, v] of Object.entries(MODEL_MAP)) if (m.startsWith(k.replace(/-\d{8}$/, ""))) return v;
  if (/opus/.test(m)) return MODEL_MAP["claude-opus-5"]; if (/sonnet/.test(m)) return MODEL_MAP["claude-sonnet-5"]; if (/fable|mythos/.test(m)) return MODEL_MAP["claude-fable-5-1"]; if (/haiku/.test(m)) return MODEL_MAP["claude-haiku-4-5-20251001"];
  return MODEL_MAP["claude-opus-5"];
}

/**
 * strict 구조화 출력 규격으로 변환: 모든 object 는 additionalProperties:false + required = 전 키. 원래 선택 필드는 null 허용으로 바꾸고 경로를 기록해
 * 응답에서 null 이면 키를 지운다(기존 단계 코드는 `??`·존재 검사로 선택 필드를 다룬다). strict 가 지원하지 않는 제약 키워드는 뺀다(뜻은 프롬프트가 이미 말한다).
 */
const STRIP = new Set(["minItems", "maxItems", "minLength", "maxLength", "pattern", "format", "minimum", "maximum", "default", "uniqueItems"]);
export function toStrictSchema(schema: any, optionalPaths: string[] = [], path = "$"): { schema: any; optionalPaths: string[] } {
  if (!schema || typeof schema !== "object") return { schema, optionalPaths };
  if (Array.isArray(schema)) return { schema: schema.map((x) => toStrictSchema(x, optionalPaths, path).schema), optionalPaths };
  const out: any = {};
  for (const [k, v] of Object.entries(schema)) { if (STRIP.has(k)) continue; out[k] = v; }
  if (out.type === "object" && out.properties) {
    const req = new Set<string>(out.required ?? []);
    const props: any = {};
    for (const [k, v] of Object.entries<any>(out.properties)) {
      const sub = toStrictSchema(v, optionalPaths, `${path}.${k}`).schema;
      if (!req.has(k)) { optionalPaths.push(`${path}.${k}`); props[k] = nullable(sub); } else props[k] = sub;
    }
    out.properties = props; out.required = Object.keys(props); out.additionalProperties = false;
  } else if (out.type === "array" && out.items) out.items = toStrictSchema(out.items, optionalPaths, `${path}[]`).schema;
  else if (Array.isArray(out.anyOf)) out.anyOf = out.anyOf.map((x: any) => toStrictSchema(x, optionalPaths, path).schema);
  return { schema: out, optionalPaths };
}
function nullable(s: any): any {
  if (s?.anyOf) return { anyOf: [...s.anyOf, { type: "null" }] };
  if (typeof s?.type === "string") return { ...s, type: [s.type, "null"] };
  if (Array.isArray(s?.type)) return s.type.includes("null") ? s : { ...s, type: [...s.type, "null"] };
  return { anyOf: [s, { type: "null" }] };
}
/** 선택 필드가 null 로 왔으면 키를 지운다 (경로 "$.a.b", "$.items[].x") */
export function dropNulls(value: any, optionalPaths: string[]): any {
  if (!optionalPaths.length) return value;
  const walk = (v: any, p: string): any => {
    if (Array.isArray(v)) return v.map((x) => walk(x, `${p}[]`));
    if (v && typeof v === "object") { for (const k of Object.keys(v)) { const cp = `${p}.${k}`; if (v[k] === null && optionalPaths.includes(cp)) delete v[k]; else v[k] = walk(v[k], cp); } }
    return v;
  };
  return walk(value, "$");
}

export class OpenAiExecutor implements Executor {
  readonly kind = "openai" as const;
  constructor(private defaultModel?: string) {}

  async run<T>(req: ExecRequest): Promise<ExecResult<T>> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("EXECUTOR=openai 이지만 OPENAI_API_KEY 가 없습니다");
    if ((req.tools && req.tools.length) || req.allowedTools.length) throw new Error(`OpenAI 실행기는 단발 호출만 지원합니다 (tools: [${(req.tools ?? []).join(",")}] allowed: [${req.allowedTools.join(",")}])`);
    const model = mapOpenAiModel(req.model ?? this.defaultModel);
    const { schema, optionalPaths } = toStrictSchema(req.schema);
    const input: { role: string; content: string }[] = [];
    if (req.systemPrompt) input.push({ role: "system", content: req.systemPrompt });
    input.push({ role: "user", content: req.prompt });
    const body: any = {
      model, input, store: false,
      max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 65536),
      text: { format: { type: "json_schema", name: "result", strict: true, schema } },
    };
    if (req.effort) body.reasoning = { effort: EFFORT[req.effort] ?? "medium" };
    // 출력 길이 성향 (GPT-5 계열 text.verbosity, 기본 medium). Claude 엔 없는 축이라 2026-09-19 첫 짝 비교 때 빠져 있었다 — 대본이 일관되게 짧았던 원인 후보
    const verbosity = process.env.OPENAI_VERBOSITY || "";
    if (/^(low|medium|high)$/.test(verbosity)) body.text.verbosity = verbosity;
    const started = Date.now();
    const progress: Progress = { detail: `OpenAI ${model} 요청 중…`, toolCounts: {}, turns: 0, elapsedMs: 0 };
    req.onProgress?.({ ...progress });
    const tick = setInterval(() => { progress.elapsedMs = Date.now() - started; progress.detail = `OpenAI ${model} 응답 대기 (${Math.round(progress.elapsedMs / 1000)}s)`; req.onProgress?.({ ...progress }); }, 15_000);
    try {
      let res = await this.call(key, body, req.timeoutMs);
      // strict 가 스키마의 어떤 구성을 거부하면 비엄격으로 한 번 더 (400 + schema 언급)
      if (res.status === 400 && /schema|strict|additionalProperties|required/i.test(res.text)) {
        body.text.format = { type: "json_schema", name: "result", strict: false, schema: req.schema };
        res = await this.call(key, body, req.timeoutMs);
      }
      if (res.status === 400 && /reasoning|effort/i.test(res.text) && body.reasoning) { delete body.reasoning; res = await this.call(key, body, req.timeoutMs); }
      if (res.status === 400 && /verbosity/i.test(res.text) && body.text.verbosity) { delete body.text.verbosity; res = await this.call(key, body, req.timeoutMs); }
      if (res.status !== 200) throw new Error(`OpenAI ${res.status}: ${res.text.slice(0, 600)}`);
      const data = JSON.parse(res.text);
      if (data.status && data.status !== "completed") throw new Error(`OpenAI 응답 미완료 (${data.status}: ${JSON.stringify(data.incomplete_details ?? {}).slice(0, 200)}) — max_output_tokens 확인`);
      const msg = (data.output ?? []).find((o: any) => o.type === "message");
      const part = msg?.content?.find((c: any) => c.type === "output_text") ?? msg?.content?.[0];
      if (!part) { const refusal = msg?.content?.find((c: any) => c.type === "refusal"); throw new Error(refusal ? `OpenAI 거부: ${String(refusal.refusal).slice(0, 300)}` : `OpenAI 출력에 message 가 없음: ${JSON.stringify(data.output ?? []).slice(0, 300)}`); }
      let output: any;
      try { output = JSON.parse(part.text); } catch (e) { throw new Error(`OpenAI 출력 JSON 파싱 실패: ${String(part.text).slice(0, 300)}`); }
      output = dropNulls(output, optionalPaths);
      const u = data.usage ?? {};
      const cached = Number(u.input_tokens_details?.cached_tokens ?? 0), inTok = Number(u.input_tokens ?? 0), outTok = Number(u.output_tokens ?? 0), reasoning = Number(u.output_tokens_details?.reasoning_tokens ?? 0);
      const price = PRICE[model] ?? PRICE[Object.keys(PRICE).find((k) => model.startsWith(k)) ?? ""] ?? [0, 0, 0];
      const cost = ((inTok - cached) * price[0] + cached * price[1] + outTok * price[2]) / 1e6;
      return {
        output: output as T, model: String(data.model ?? model), numTurns: 1, durationMs: Date.now() - started, listCostUsd: Math.round(cost * 1e6) / 1e6,
        raw: { usage: { input_tokens: inTok - cached, cache_creation_input_tokens: 0, cache_read_input_tokens: cached, output_tokens: outTok, output_tokens_details: { thinking_tokens: reasoning } }, openai: { id: data.id, model: data.model, usage: u } },
      };
    } finally { clearInterval(tick); }
  }

  /** 429·5xx 는 최대 3회 지수 대기. 작업 취소·타임아웃은 AbortSignal 로 */
  private async call(key: string, body: any, timeoutMs: number): Promise<{ status: number; text: string }> {
    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    let last: { status: number; text: string } = { status: 0, text: "" };
    for (let attempt = 1; attempt <= 3; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(new Error("timeout")), timeoutMs);
      const abort = jobAbortSignal();
      const onAbort = () => ctl.abort(Object.assign(new Error("작업이 취소됨 (콘솔)"), { name: "JobCancelled" }));
      abort?.addEventListener("abort", onAbort, { once: true });
      try {
        const r = await fetch(`${base}/responses`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: ctl.signal });
        last = { status: r.status, text: await r.text() };
        if (r.status !== 429 && r.status < 500) return last;
      } catch (e: any) {
        if (abort?.aborted) throw Object.assign(new Error("작업이 취소됨 (콘솔) — OpenAI 요청 중단"), { name: "JobCancelled" });
        if (/timeout/.test(String(e?.message ?? e?.cause?.message ?? e))) throw new Error(`OpenAI 요청 시간 초과 (${Math.round(timeoutMs / 1000)}s)`);
        last = { status: 0, text: String(e?.message ?? e) };
      } finally { clearTimeout(timer); abort?.removeEventListener("abort", onAbort); }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
    return last;
  }
}
