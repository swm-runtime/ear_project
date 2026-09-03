/**
 * 제품(ear) API 클라이언트 — 브라우저 전용.
 *
 * 파이프라인 웹은 Supabase 로그인이고, 제품 관리 API(`/admin/*`)는 제품 서버의 JWT
 * (`users.role = admin`)를 요구한다(admin.md 4.1). 두 번 로그인하지 않도록 `/api/ear/sso`가
 * Supabase 세션의 이메일로 어서션을 서명해 제품 토큰과 **자동 교환**한다
 * (changes/pending/pipeline-sso-login.md). 토큰은 이 브라우저에만 둔다.
 *
 * 모든 호출은 같은 오리진의 프록시(`/api/ear/*`)를 거친다 — 제품 서버 CORS 개조 없이
 * 동작하고, 프록시가 Supabase 로그인(팀원)만 통과시켜 이중 방어가 된다.
 */

export interface EarTokens {
  access_token: string;
  refresh_token: string;
}

const TOKENS_KEY = "ear_admin_tokens";
const DEVICE_KEY = "ear_pipeline_device_id";

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = `pipeline-web-${crypto.randomUUID()}`; localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

export function loadTokens(): EarTokens | null {
  try { const raw = localStorage.getItem(TOKENS_KEY); return raw ? (JSON.parse(raw) as EarTokens) : null; } catch { return null; }
}
export function saveTokens(t: EarTokens): void { localStorage.setItem(TOKENS_KEY, JSON.stringify(t)); }
export function clearTokens(): void { localStorage.removeItem(TOKENS_KEY); }

/** access 토큰 페이로드 — 역할 안내용 표시에만 쓴다. 판정은 서버가 한다 */
export function tokenClaims(): { sub?: string; role?: string } {
  const t = loadTokens();
  if (!t) return {};
  try { return JSON.parse(atob(t.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return {}; }
}

export class EarAuthError extends Error {
  constructor(msg = "제품 서버 로그인이 필요해요") { super(msg); this.name = "EarAuthError"; }
}
export class EarApiError extends Error {
  constructor(public status: number, public errorCode: string | undefined, msg: string, public field?: string) {
    super(msg); this.name = "EarApiError";
  }
}

async function rawFetch(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`/api/ear${path}`, { ...init, headers });
}

async function toError(res: Response): Promise<EarApiError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error_code?: string; field?: string };
  return new EarApiError(res.status, body.error_code, body.message ?? `HTTP ${res.status}`, body.field);
}

async function tryRefresh(): Promise<boolean> {
  const t = loadTokens();
  if (!t?.refresh_token) return false;
  const res = await rawFetch("/auth/token/refresh", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: t.refresh_token, device_id: deviceId() }),
  });
  if (!res.ok) { clearTokens(); return false; }
  const b = (await res.json()) as EarTokens;
  saveTokens({ access_token: b.access_token, refresh_token: b.refresh_token });
  return true;
}

/** 제품 API 호출 — 401 이면 refresh 1회 후 재시도, 그래도 실패면 EarAuthError */
export async function earFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = loadTokens();
  if (!t) throw new EarAuthError();
  let res = await rawFetch(path, init, t.access_token);
  if (res.status === 401) {
    if (!(await tryRefresh())) throw new EarAuthError();
    res = await rawFetch(path, init, loadTokens()!.access_token);
    if (res.status === 401) { clearTokens(); throw new EarAuthError(); }
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

/**
 * Supabase 세션 → 서버 SSO(`/api/ear/sso`) → 제품 토큰. 사용자 입력 없이 연결된다.
 * 같은 이메일의 제품 관리자 계정이 없으면 서버가 403으로 알려준다.
 */
export async function connectEar(): Promise<{ role: string; sub: string }> {
  const res = await fetch("/api/ear/sso", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: deviceId() }),
  });
  if (!res.ok) throw await toError(res);
  const b = (await res.json()) as EarTokens;
  saveTokens({ access_token: b.access_token, refresh_token: b.refresh_token });
  const claims = tokenClaims();
  return { role: claims.role ?? "?", sub: claims.sub ?? "?" };
}

// ── 제품 API 타입 (spec은 docs/changes/pending/admin-web-console.md — admin-api 계약) ──

export interface EarTopic {
  id: string; name: string; parent_category: string;
  is_visible: boolean; display_order: number; content_count: number;
}
export interface EarContent {
  id: string; title: string; description: string; origin: string; status: string;
  author_name: string | null; source_name: string; source_url: string | null;
  duration_sec: number; thumbnail_url: string; content_version: number;
  license_expires_at: string | null; published_at: string; withdrawn_at: string | null;
  topics: { topic_id: string; name: string }[];
}

export const listEarTopics = () => earFetch<{ items: EarTopic[] }>("/admin/topics");
export const createEarTopic = (name: string, parent_category: string) =>
  earFetch<EarTopic>("/admin/topics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, parent_category }) });
export const patchEarTopic = (id: string, fields: Partial<{ name: string; parent_category: string; is_visible: boolean; display_order: number }>) =>
  earFetch<EarTopic>(`/admin/topics/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });
export const deleteEarTopic = (id: string) => earFetch<void>(`/admin/topics/${id}`, { method: "DELETE" });

export const listEarContents = (status: string, offset: number, limit = 20) =>
  earFetch<{ items: EarContent[]; total: number }>(`/admin/contents?offset=${offset}&limit=${limit}${status ? `&status=${status}` : ""}`);
export const withdrawEarContent = (id: string, reason?: string) =>
  earFetch<EarContent>(`/admin/contents/${id}/withdraw`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reason ? { reason } : {}) });
export const restoreEarContent = (id: string) =>
  earFetch<EarContent>(`/admin/contents/${id}/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });

export interface UploadPayload {
  title: string; description: string; origin: "ai_generated" | "partner";
  source_name: string; topic_ids: string[];
  sources?: { title: string; author?: string; url?: string }[];
  author_name?: string; source_url?: string; partner_id?: string; license_expires_at?: string;
  series_id?: string; episode_no?: number; total_episodes?: number;
  review_confirmed: boolean;
}

export function uploadEarContent(payload: UploadPayload, audio: File, thumbnail: File): Promise<EarContent> {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  fd.append("audio", audio);
  fd.append("thumbnail", thumbnail);
  return earFetch<EarContent>("/admin/contents", { method: "POST", body: fd });
}
