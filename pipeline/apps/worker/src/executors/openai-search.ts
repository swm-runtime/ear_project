import { searchExcludedHosts } from "../db.js";
import { classifyLimit, dropNulls, mapOpenAiModel, OpenAiExecutor, PRICE, toStrictSchema } from "./openai-api.js";
import type { ExecRequest, ExecResult, Progress } from "./types.js";

/**
 * 글로벌판 전용 OpenAI 실행기 — 단발 호출 + OpenAI 웹 검색 도구 (2026-10-15 KAN-209, 글로벌 명세 4.4).
 * - `PIPELINE_LOCALE=en` 인스턴스에서만 만들어진다(executors/index.ts). 한국판은 종전 OpenAiExecutor 그대로라 도구 요청을 계속 거절한다.
 * - 도구가 `WebSearch` 하나인 요청(주제 기획 B-②·보강 B-① 의 검색 단계)만 이 경로로 받는다. 그 밖의 도구 요청은 부모가 거절하고, 단발 호출은 부모가 처리한다.
 * - **검색 상한은 실행기가 센다** — `max_tool_calls`(내장 도구 호출 합계)로 묶고, 응답의 `web_search_call` 을 다시 세어 넘으면 실패로 본다.
 * - 차단·보류·자동 제외 도메인은 `filters.blocked_domains`(최대 100)로 보내되 그것만 믿지 않는다 — 단계 코드가 적재 전에 다시 거른다(topic-seed·reinforce).
 * - 결과는 단계 스키마(링크·제목·스니펫)로만 받는다. 출력 `sources[].url` 중 **검색 도구가 실제로 본 URL 이 아닌 것은 버린다**(지어낸 링크 차단).
 *   검색 엔진의 요약·인용 문장은 어디에도 넘기지 않는다(명세 6.1).
 * - 비용 = 토큰 × 단가 + 검색 1회 $0.01(developers.openai.com/api/docs/pricing 2026-10-15: 웹 검색 $10/1k calls, 검색 콘텐츠 토큰은 모델 단가 — usage 에 포함).
 */
export const SEARCH_CAP = 8;
const SEARCH_CALL_USD = 0.01;

export function isWebSearchOnly(req: ExecRequest): boolean {
  const tools = req.tools ?? req.allowedTools;
  return req.allowedTools.length === 1 && req.allowedTools[0] === "WebSearch" && tools.length === 1 && tools[0] === "WebSearch";
}

/** 스니펫에서 온 URL 의 HTML 엔티티(&amp;)를 푼다 — 그대로 적재하면 열리지 않는 링크가 된다(2026-10-15 실호출) */
export const cleanUrl = (u: string) => u.trim().replace(/&amp;/g, "&");

/** URL 비교 키 — 프로토콜·www·끝 슬래시·조각(#)·&amp; 를 무시한다 */
export function urlKey(u: string): string {
  try { const x = new URL(cleanUrl(u)); return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}${x.search}`; } catch { return u.trim(); }
}

/** 응답 output 에서 검색 호출·검색어·도구가 본 URL 을 모은다 (search · open_page · find_in_page) */
export function collectSearchTrace(output: any[]): { searches: number; calls: number; queries: string[]; seen: Set<string> } {
  let searches = 0, calls = 0; const queries: string[] = []; const seen = new Set<string>();
  for (const o of output ?? []) {
    if (o?.type === "message") for (const c of o.content ?? []) for (const a of c?.annotations ?? []) if (a?.type === "url_citation" && a.url) seen.add(urlKey(a.url));
    if (o?.type !== "web_search_call") continue;
    calls++;
    const a = o.action ?? {};
    if (a.type === "search" || !a.type) {
      searches++;
      // 응답이 query 와 queries 를 같은 값으로 함께 줄 때가 있다(2026-10-15 실호출) — queries 가 있으면 그것만
      for (const q of Array.isArray(a.queries) && a.queries.length ? a.queries : [a.query]) if (typeof q === "string" && q.trim()) queries.push(q.trim());
    }
    if (a.url) seen.add(urlKey(a.url));
    for (const s of a.sources ?? []) if (s?.url) seen.add(urlKey(s.url));
  }
  return { searches, calls, queries, seen };
}

/** 출력의 `sources[]` 중 도구가 본 적 없는 URL 을 뺀다. 도구가 본 URL 이 하나도 없으면(출처 목록 미제공) 거르지 않고 그대로 둔다 */
export function keepSeenSources(output: any, seen: Set<string>): { output: any; dropped: string[] } {
  if (!seen.size || !Array.isArray(output?.sources)) return { output, dropped: [] };
  const dropped: string[] = [];
  const sources = output.sources.filter((s: any) => { const ok = typeof s?.url === "string" && seen.has(urlKey(s.url)); if (!ok) dropped.push(String(s?.url ?? "")); return ok; }).map((s: any) => ({ ...s, url: cleanUrl(s.url) }));
  return { output: { ...output, sources }, dropped };
}

export class OpenAiSearchExecutor extends OpenAiExecutor {
  constructor(private searchDefaultModel?: string, private excludedHosts: () => Promise<string[]> = searchExcludedHosts) { super(searchDefaultModel); }

  override async run<T>(req: ExecRequest): Promise<ExecResult<T>> {
    if (!isWebSearchOnly(req)) return super.run<T>(req);
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("EXECUTOR=openai 이지만 OPENAI_API_KEY 가 없습니다");
    const model = mapOpenAiModel(req.model ?? this.searchDefaultModel);
    const { schema, optionalPaths } = toStrictSchema(req.schema);
    const blocked = (await this.excludedHosts().catch(() => [] as string[])).slice(0, 100);
    const tool: any = { type: "web_search", search_context_size: process.env.OPENAI_SEARCH_CONTEXT || "medium" };
    if (blocked.length) tool.filters = { blocked_domains: blocked };
    const input: { role: string; content: string }[] = [];
    if (req.systemPrompt) input.push({ role: "system", content: req.systemPrompt });
    input.push({ role: "user", content: req.prompt });
    const body: any = {
      model, input, store: false, tools: [tool], tool_choice: "auto", max_tool_calls: SEARCH_CAP,
      include: ["web_search_call.action.sources"],
      max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 65536),
      text: { format: { type: "json_schema", name: "result", strict: true, schema } },
    };
    if (req.effort) body.reasoning = { effort: req.effort };
    const started = Date.now();
    const progress: Progress = { detail: `OpenAI ${model} 웹 검색 중…`, toolCounts: {}, turns: 0, elapsedMs: 0 };
    req.onProgress?.({ ...progress });
    const tick = setInterval(() => { progress.elapsedMs = Date.now() - started; progress.detail = `OpenAI ${model} 웹 검색 응답 대기 (${Math.round(progress.elapsedMs / 1000)}s)`; req.onProgress?.({ ...progress }); }, 15_000);
    try {
      let res = await this.call(key, body, req.timeoutMs);
      if (res.status === 400 && /schema|strict|additionalProperties|required/i.test(res.text)) {
        body.text.format = { type: "json_schema", name: "result", strict: false, schema: req.schema };
        res = await this.call(key, body, req.timeoutMs);
      }
      if (res.status === 400 && /reasoning|effort/i.test(res.text) && body.reasoning) { delete body.reasoning; res = await this.call(key, body, req.timeoutMs); }
      if (res.status === 429) throw classifyLimit(res.text);
      if (res.status !== 200) throw new Error(`OpenAI 웹 검색 ${res.status}: ${res.text.slice(0, 600)}`);
      const data = JSON.parse(res.text);
      if (data.status && data.status !== "completed") throw new Error(`OpenAI 응답 미완료 (${data.status}: ${JSON.stringify(data.incomplete_details ?? {}).slice(0, 200)})`);
      const trace = collectSearchTrace(data.output ?? []);
      if (trace.calls > SEARCH_CAP) throw new Error(`웹 검색 상한 초과 (${trace.calls}회 > ${SEARCH_CAP}) — 결과를 쓰지 않는다`);
      const msg = (data.output ?? []).find((o: any) => o.type === "message");
      const part = msg?.content?.find((c: any) => c.type === "output_text") ?? msg?.content?.[0];
      if (!part) { const refusal = msg?.content?.find((c: any) => c.type === "refusal"); throw new Error(refusal ? `OpenAI 거부: ${String(refusal.refusal).slice(0, 300)}` : `OpenAI 출력에 message 가 없음: ${JSON.stringify(data.output ?? []).slice(0, 300)}`); }
      let parsed: any;
      try { parsed = JSON.parse(part.text); } catch { throw new Error(`OpenAI 출력 JSON 파싱 실패: ${String(part.text).slice(0, 300)}`); }
      parsed = dropNulls(parsed, optionalPaths);
      const { output, dropped } = keepSeenSources(parsed, trace.seen);
      if (Array.isArray(output?.queries) && trace.queries.length) output.queries = trace.queries; // 모델이 적은 검색어 대신 실제로 친 검색어 — 단계가 이 길이를 검색 횟수로 기록한다
      progress.toolCounts = { WebSearch: trace.searches }; progress.turns = 1; progress.elapsedMs = Date.now() - started; progress.detail = `검색 ${trace.searches}회`;
      req.onProgress?.({ ...progress });
      const u = data.usage ?? {};
      const cached = Number(u.input_tokens_details?.cached_tokens ?? 0), inTok = Number(u.input_tokens ?? 0), outTok = Number(u.output_tokens ?? 0), reasoning = Number(u.output_tokens_details?.reasoning_tokens ?? 0);
      const price = PRICE[model] ?? PRICE[Object.keys(PRICE).find((k) => model.startsWith(k)) ?? ""] ?? [0, 0, 0];
      const cost = ((inTok - cached) * price[0] + cached * price[1] + outTok * price[2]) / 1e6 + trace.calls * SEARCH_CALL_USD;
      return {
        output: output as T, model: String(data.model ?? model), numTurns: 1, durationMs: Date.now() - started, listCostUsd: Math.round(cost * 1e6) / 1e6,
        raw: {
          usage: { input_tokens: inTok - cached, cache_creation_input_tokens: 0, cache_read_input_tokens: cached, output_tokens: outTok, output_tokens_details: { thinking_tokens: reasoning } },
          openai: { id: data.id, model: data.model, usage: u },
          web_search: { calls: trace.calls, searches: trace.searches, queries: trace.queries, seen_urls: trace.seen.size, blocked_sent: blocked.length, dropped_unseen: dropped },
        },
      };
    } finally { clearInterval(tick); }
  }
}
