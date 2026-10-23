import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { OpenAiExecutor } from "./openai-api.js";
import type { ExecRequest } from "./types.js";

// 2026-10-23 — 장시간 호출(글로벌 judge_loop 재작성)은 background=true 로 넣고 GET /responses/{id} 로 끝을 기다린다
const saved = { key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
afterEach(() => { if (saved.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.key; globalThis.fetch = saved.fetch; });

class Fast extends OpenAiExecutor { protected override pollIntervalMs = 1; }
const SCHEMA = { type: "object", required: ["a"], properties: { a: { type: "string" } } };
const req = (background: boolean, maxOutputTokens?: number): ExecRequest => ({ prompt: "p", schema: SCHEMA, allowedTools: [], tools: [], cwd: "/tmp", timeoutMs: 60_000, model: "gpt-6.1-sol", background, maxOutputTokens });
const done = { id: "resp_1", status: "completed", model: "gpt-6.1-sol", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ a: "ok" }) }] }], usage: { input_tokens: 10, output_tokens: 5 } };

test("background=true 면 요청 본문에 background 가 실리고, queued→in_progress→completed 를 조회해 결과를 돌려준다", async () => {
  process.env.OPENAI_API_KEY = "k";
  const calls: { url: string; method: string; body?: any }[] = [];
  let polls = 0;
  globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
    if (init?.method === "POST") return new Response(JSON.stringify({ id: "resp_1", status: "queued" }), { status: 200 });
    polls++;
    return new Response(JSON.stringify(polls < 3 ? { id: "resp_1", status: "in_progress" } : done), { status: 200 });
  }) as typeof fetch;
  const r = await new Fast("gpt-6.1-sol").run<{ a: string }>(req(true));
  assert.equal(r.output.a, "ok");
  assert.equal(calls[0].body.background, true);
  assert.equal(calls[0].body.store, false);
  assert.ok(calls.slice(1).every((c) => c.method === "GET" && c.url.endsWith("/responses/resp_1")));
  assert.equal(polls, 3);
});

test("background 미지정이면 종전대로 동기 요청 하나로 끝난다 (한국판 경로 불변)", async () => {
  process.env.OPENAI_API_KEY = "k";
  const sent: any[] = [];
  globalThis.fetch = (async (_url: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify(done), { status: 200 }); }) as typeof fetch;
  const r = await new Fast("gpt-6.1-sol").run<{ a: string }>(req(false));
  assert.equal(r.output.a, "ok");
  assert.equal(sent.length, 1);
  assert.equal("background" in sent[0], false);
});

test("백그라운드 조회가 시간 초과면 /cancel 을 보내고 던진다", async () => {
  process.env.OPENAI_API_KEY = "k";
  const posts: string[] = [];
  globalThis.fetch = (async (url: string, init?: { method?: string }) => {
    if (init?.method === "POST") { posts.push(url); return new Response(JSON.stringify({ id: "resp_2", status: "queued" }), { status: 200 }); }
    return new Response(JSON.stringify({ id: "resp_2", status: "in_progress" }), { status: 200 });
  }) as typeof fetch;
  await assert.rejects(new Fast("gpt-6.1-sol").run({ ...req(true), timeoutMs: 20 }), /시간 초과/);
  assert.ok(posts.some((u) => u.endsWith("/responses/resp_2/cancel")));
});

test("maxOutputTokens 를 주면 그 값이 max_output_tokens 로 실리고, 상한에 닿아 incomplete 면 사용량을 담아 던진다", async () => {
  process.env.OPENAI_API_KEY = "k";
  const sent: any[] = [];
  const cut = { id: "resp_3", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [], usage: { input_tokens: 10, output_tokens: 24576, output_tokens_details: { reasoning_tokens: 24500 } } };
  globalThis.fetch = (async (_url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") { sent.push(JSON.parse(init.body!)); return new Response(JSON.stringify({ id: "resp_3", status: "queued" }), { status: 200 }); }
    return new Response(JSON.stringify(cut), { status: 200 });
  }) as typeof fetch;
  await assert.rejects(() => new Fast("gpt-6.1-sol").run(req(true, 24_576)), /응답 미완료 \(incomplete.*max_output_tokens 24576 · 출력 24576 \(생각 24500\)/);
  assert.equal(sent[0].max_output_tokens, 24_576);
});
