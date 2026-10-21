import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { makeExecutor } from "./index.js";
import { OpenAiExecutor } from "./openai-api.js";
import { OpenAiSearchExecutor, collectSearchTrace, keepSeenSources, SEARCH_CAP } from "./openai-search.js";
import type { ExecRequest } from "./types.js";

// 2026-10-15 KAN-209 — 웹 검색은 en 인스턴스의 OpenAI 실행기에만 붙는다. 한국판 OpenAI 실행기는 도구 요청을 종전처럼 거절한다
const saved = { locale: process.env.PIPELINE_LOCALE, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
afterEach(() => {
  if (saved.locale === undefined) delete process.env.PIPELINE_LOCALE; else process.env.PIPELINE_LOCALE = saved.locale;
  if (saved.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.key;
  globalThis.fetch = saved.fetch;
});

const SCHEMA = { type: "object", required: ["queries", "sources", "notes"], properties: { queries: { type: "array", items: { type: "string" } }, sources: { type: "array", items: { type: "object", required: ["url", "title"], properties: { url: { type: "string" }, title: { type: "string" } } } }, notes: { type: "string" } } };
const searchReq = (): ExecRequest => ({ prompt: "find sources", schema: SCHEMA, allowedTools: ["WebSearch"], cwd: "/tmp", timeoutMs: 5_000, model: "gpt-6.1-sol", effort: "medium" });

/** fetch 대역 — 보낸 본문을 기록하고 정해 둔 Responses API 응답을 돌려준다 */
function stubFetch(response: unknown) {
  const sent: any[] = [];
  globalThis.fetch = (async (_url: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify(response), { status: 200 }); }) as typeof fetch;
  return sent;
}
const searchCall = (query: string, urls: string[]) => ({ type: "web_search_call", id: `ws_${query}`, status: "completed", action: { type: "search", query, sources: urls.map((url) => ({ type: "url", url })) } });
const message = (out: unknown) => ({ type: "message", content: [{ type: "output_text", text: JSON.stringify(out), annotations: [] }] });
const usage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 100, output_tokens_details: { reasoning_tokens: 0 } };

test("한국판(PIPELINE_LOCALE 없음)의 openai 실행기도 검색 실행기다 — 2026-10-16 KAN-222 (종전: 검색 없는 실행기라 WebSearch 요청을 거절했다)", async () => {
  delete process.env.PIPELINE_LOCALE;
  process.env.OPENAI_API_KEY = "test";
  const ex = makeExecutor("openai");
  assert.ok(ex instanceof OpenAiSearchExecutor);
  assert.ok(ex instanceof OpenAiExecutor); // 단발 호출은 부모 경로 그대로
  const sent = stubFetch({ status: "completed", model: "gpt-6.1-sol", output: [searchCall("김장 문화", ["https://www.korea.kr/a"]), message({ queries: [], sources: [{ url: "https://www.korea.kr/a", title: "t" }], notes: "" })], usage });
  const r = await (ex as OpenAiSearchExecutor).run<any>(searchReq());
  assert.equal(sent[0].tools[0].type, "web_search");
  assert.deepEqual(r.output.queries, ["김장 문화"]);
});

test("en 인스턴스의 openai 실행기는 검색 실행기다", () => {
  process.env.PIPELINE_LOCALE = "en";
  assert.ok(makeExecutor("openai") instanceof OpenAiSearchExecutor);
});

test("검색 요청: web_search 도구·차단 도메인·검색 상한·출처 목록을 보내고, 도구가 보지 않은 URL 은 버린다", async () => {
  process.env.OPENAI_API_KEY = "test";
  const sent = stubFetch({ id: "r1", model: "gpt-6.1-sol", status: "completed", usage, output: [
    searchCall("kimchi history", ["https://www.korea.net/kimchi", "https://example.org/a"]),
    searchCall("kimjang unesco", ["https://ich.unesco.org/en/RL/kimjang-00881"]),
    message({ queries: ["모델이 적은 검색어"], sources: [{ url: "https://korea.net/kimchi/", title: "Kimchi" }, { url: "https://ich.unesco.org/en/RL/kimjang-00881", title: "Kimjang" }, { url: "https://made-up.example/x", title: "지어낸 링크" }], notes: "" }),
  ] });
  const ex = new OpenAiSearchExecutor(undefined, async () => ["blocked.example", "hold.example"]);
  const r = await ex.run<any>(searchReq());
  const body = sent[0];
  assert.equal(body.tools[0].type, "web_search");
  assert.deepEqual(body.tools[0].filters.blocked_domains, ["blocked.example", "hold.example"]);
  assert.equal(body.max_tool_calls, SEARCH_CAP);
  assert.deepEqual(body.include, ["web_search_call.action.sources"]);
  assert.equal(body.text.format.type, "json_schema");
  assert.deepEqual(r.output.sources.map((s: any) => s.title), ["Kimchi", "Kimjang"]); // www·끝 슬래시 차이는 같은 URL 로 본다
  assert.deepEqual(r.output.queries, ["kimchi history", "kimjang unesco"]); // 실제로 친 검색어로 바꾼다
  assert.deepEqual((r.raw as any).web_search.dropped_unseen, ["https://made-up.example/x"]);
  assert.equal(r.listCostUsd, (1000 * 2 + 100 * 10) / 1e6 + 2 * 0.01); // 토큰 + 검색 2회
});

test("검색 호출이 상한을 넘으면 결과를 쓰지 않는다", async () => {
  process.env.OPENAI_API_KEY = "test";
  stubFetch({ status: "completed", usage, output: [...Array.from({ length: SEARCH_CAP + 1 }, (_, i) => searchCall(`q${i}`, [])), message({ queries: [], sources: [], notes: "" })] });
  await assert.rejects(new OpenAiSearchExecutor(undefined, async () => []).run(searchReq()), /상한 초과/);
});

test("en 에서도 단발 호출은 종전 경로(도구 없음), WebSearch 밖의 도구 요청은 거절한다", async () => {
  process.env.OPENAI_API_KEY = "test";
  const sent = stubFetch({ status: "completed", usage, output: [message({ queries: [], sources: [], notes: "ok" })] });
  const ex = new OpenAiSearchExecutor(undefined, async () => ["blocked.example"]);
  await ex.run({ ...searchReq(), allowedTools: [], tools: [] });
  assert.equal(sent[0].tools, undefined);
  await assert.rejects(ex.run({ ...searchReq(), allowedTools: ["Read", "WebSearch"] }), /단발 호출만 지원/);
});

test("출처 목록이 비어 있으면(제공자가 안 줌) 출력 소스를 거르지 않는다", () => {
  const out = { sources: [{ url: "https://a.example/x" }] };
  assert.deepEqual(keepSeenSources(out, new Set()).output, out);
  assert.equal(collectSearchTrace([{ type: "web_search_call", action: { type: "open_page", url: "https://b.example/p" } }]).seen.has("b.example/p"), true);
});

test("실호출 형태: query·queries 가 함께 오면 한 번만 세고, URL 의 &amp; 는 풀어서 적재한다", () => {
  const trace = collectSearchTrace([{ type: "web_search_call", action: { type: "search", query: "kimjang unesco", queries: ["kimjang unesco"], sources: [{ type: "url", url: "https://ich.unesco.org/en/search?call=film&amp;id=1" }] } }]);
  assert.deepEqual(trace.queries, ["kimjang unesco"]);
  const { output } = keepSeenSources({ sources: [{ url: "https://ich.unesco.org/en/search?call=film&amp;id=1" }] }, trace.seen);
  assert.equal(output.sources[0].url, "https://ich.unesco.org/en/search?call=film&id=1");
});

// 2026-10-16 KAN-222 — 한국판 서버 워커(openai)도 보강·주제 기획(WebSearch 만 쓰는 검색)을 집는다. 언어가 아니라 실행기 능력으로 판정한다
test("openai 실행기는 언어와 무관하게 웹 검색 실행기이고, 웹 검색 작업을 집는 실행기는 claude-cli·openai 뿐이다", async () => {
  const { makeExecutor, executorHandlesWebSearch } = await import("./index.js");
  const { OpenAiSearchExecutor } = await import("./openai-search.js");
  const prev = process.env.PIPELINE_LOCALE;
  for (const loc of ["", "ko", "en"]) {
    if (loc) process.env.PIPELINE_LOCALE = loc; else delete process.env.PIPELINE_LOCALE;
    assert.ok(makeExecutor("openai") instanceof OpenAiSearchExecutor, `locale=${loc || "(없음)"}`);
  }
  if (prev === undefined) delete process.env.PIPELINE_LOCALE; else process.env.PIPELINE_LOCALE = prev;
  assert.deepEqual((["claude-cli", "openai", "api", "none"] as const).map(executorHandlesWebSearch), [true, true, false, false]);
});
