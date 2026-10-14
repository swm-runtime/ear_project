/**
 * 글로벌판 주제 기획의 배제 주제 판정 (글로벌 명세 2.1·6.1, 2026-10-15 KAN-209) — 입력 단계에서 거부하고 사유를 보인다. 작업을 만들기 전에 웹 서버가 부른다.
 * - OpenAI Responses API 단발 호출 + 구조화 출력. 키는 워커와 같은 OPENAI_API_KEY. **키가 없거나 호출이 실패하면 입력을 받지 않는다**(판정 없이 통과시키지 않는다).
 * - 판정 결과는 작업 payload.screen → 백로그 gate1_checks.screen 으로 이어져 게이트 1 조건 3 의 근거가 된다.
 */
export interface TopicScreen { excluded: boolean; category: "none" | "person" | "politics" | "promotion"; reason: string; model: string; at: string }

const RULE = [
  "글로벌 영어 팟캐스트(K-컬처)의 기획 입력을 심사한다. 아래 셋 중 하나에 해당하면 excluded=true.",
  "person: 실존 연예인·공인의 사생활·열애·논란·사건·소송을 다루거나, 주제의 축이 한 사람이다.",
  "politics: 진행 중인 정치 현안 또는 남북 군사 현안이다.",
  "promotion: 특정 기획사·브랜드·제품을 홍보하는 주제다.",
  "해당하지 않음: 산업·현상·역사·문화의 해설. 실존 인물을 공적 활동의 확인 가능한 사실로만 언급하는 경우. 이미 끝난 역사적 정치 사건의 해설.",
  "reason 은 한국어 한 문장. excluded=false 이면 category=none, reason 은 빈 문자열.",
].join("\n");

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["excluded", "category", "reason"],
  properties: { excluded: { type: "boolean" }, category: { type: "string", enum: ["none", "person", "politics", "promotion"] }, reason: { type: "string" } },
};

export async function screenGlobalTopic(input: { topics: string[]; title: string; hint: string | null }): Promise<TopicScreen> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("배제 주제 판정을 할 수 없다 — 콘솔 서버에 OPENAI_API_KEY 가 없다");
  const model = process.env.GLOBAL_SCREEN_MODEL || "gpt-6.1-sol";
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const user = `주제: ${input.topics.join(" + ")}\n제목안: ${input.title}${input.hint ? `\n메모: ${input.hint}` : ""}`;
  const res = await fetch(`${base}/responses`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ model, store: false, input: [{ role: "system", content: RULE }, { role: "user", content: user }], reasoning: { effort: "low" }, max_output_tokens: 4000, text: { format: { type: "json_schema", name: "screen", strict: true, schema: SCHEMA } } }),
  }).catch((e) => { throw new Error(`배제 주제 판정 호출 실패: ${e?.message ?? e}`); });
  const text = await res.text();
  if (!res.ok) throw new Error(`배제 주제 판정 호출 실패 (OpenAI ${res.status}): ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  const msg = (data.output ?? []).find((o: { type?: string }) => o.type === "message");
  const part = msg?.content?.find((c: { type?: string }) => c.type === "output_text");
  if (!part) throw new Error("배제 주제 판정 응답에 결과가 없다");
  const out = JSON.parse(part.text) as Omit<TopicScreen, "model" | "at">;
  return { excluded: !!out.excluded, category: out.category, reason: out.reason ?? "", model: String(data.model ?? model), at: new Date().toISOString() };
}
