/**
 * 발행 시 임베딩 보완 (metadata-pipeline 4.3, 2026-09-22): enrichment.json 에 `embedding` 이 없으면 AI 서버에서 받아 합친다.
 * 워커가 AI 서버에 닿지 않는 자리(노트북 워커)에서 메타를 부여한 편과, 임베딩 도입 전 발행분의 소급([반영])을 위한 것이다.
 * 웹은 서버 compose 안에서 항상 AI 서버와 같은 네트워크에 있다(http://ai-server:8000). env 가 비면 손대지 않고 그대로 돌려준다.
 * 이 파일은 서버 측(라우트·서버 액션)에서만 쓴다 — 토큰이 브라우저로 가지 않게.
 */
const STUB_MODEL = "dev-stub";
const EXPECTED_MODEL = "text-embedding-3-small"; // domain.md 5.6 확정 — BE 가 글자 단위 대조
const EXPECTED_DIM = 1536;
const MAX_CHARS = 200_000;

export async function ensureEmbedding(enrichmentText: string, script: string | null): Promise<{ text: string; note: string }> {
  let file: Record<string, unknown>;
  try { file = JSON.parse(enrichmentText) as Record<string, unknown>; } catch { return { text: enrichmentText, note: "enrichment.json 파싱 실패 — 그대로 보냄" }; }
  const has = (file.embedding as { vector?: unknown } | undefined)?.vector;
  if (Array.isArray(has) && has.length) return { text: enrichmentText, note: "임베딩 있음" };
  const url = process.env.AI_SERVER_URL || "", token = process.env.AI_SERVER_TOKEN || "";
  if (!url || !token) return { text: enrichmentText, note: "임베딩 없음 — 웹에 AI_SERVER_URL·AI_SERVER_TOKEN 미설정" };
  if (!script) return { text: enrichmentText, note: "임베딩 없음 — 대본 없음(수동 업로드)" };
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/embeddings`, { method: "POST", headers: { "content-type": "application/json", "X-Internal-Token": token }, body: JSON.stringify({ text: script.slice(0, MAX_CHARS) }), signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return { text: enrichmentText, note: `임베딩 없음 — AI 서버 HTTP ${res.status}` };
    const d = (await res.json()) as { model?: string; dim?: number; vector?: number[] };
    if (!d.model || !Array.isArray(d.vector) || !d.vector.length) return { text: enrichmentText, note: "임베딩 없음 — 응답 형식 오류" };
    if (d.model === STUB_MODEL) return { text: enrichmentText, note: "임베딩 없음 — AI 서버가 stub 제공자(저장 금지)" };
    // BE parseEmbedding 과 같은 조건 — 어긋난 키를 실으면 메타 5종까지 파일 전체가 거부된다 (KAN-89 3항)
    if (d.model !== EXPECTED_MODEL) return { text: enrichmentText, note: `임베딩 없음 — 모델 불일치 ${d.model}` };
    if (d.vector.length !== EXPECTED_DIM || !d.vector.every((x) => typeof x === "number" && Number.isFinite(x))) return { text: enrichmentText, note: `임베딩 없음 — 차원 ${d.vector.length} ≠ ${EXPECTED_DIM} 또는 비정상 값` };
    file.embedding = { model: d.model, dim: d.dim ?? d.vector.length, vector: d.vector };
    return { text: JSON.stringify(file, null, 2) + "\n", note: `임베딩 보완 ${d.model} ${d.dim ?? d.vector.length}d` };
  } catch (e) { return { text: enrichmentText, note: `임베딩 없음 — ${e instanceof Error ? e.message.slice(0, 80) : "오류"}` }; }
  finally { clearTimeout(t); }
}
