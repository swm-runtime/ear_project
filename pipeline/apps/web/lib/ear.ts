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

/**
 * 연결 채널 — 어느 제품 서버에 붙는가(2026-09-29). 기본 `prod`(운영)는 종전 그대로고, `dev`(개발계)는 **추천 테스트**
 * 전용이다: 행동 버튼이 실제 신호·라이브러리를 쓰므로 운영에 붙이지 않는다. 채널마다 프록시 경로와 토큰 저장 키가
 * 다르다 — 두 서버의 JWT 는 서로 통하지 않아 한 키에 섞이면 401 재교환이 무한히 돈다.
 */
export type EarChannel = "prod" | "dev";
const CHANNEL = {
  prod: { proxy: "/api/ear", tokensKey: "ear_admin_tokens", label: "운영" },
  dev: { proxy: "/api/ear-dev", tokensKey: "ear_dev_admin_tokens", label: "개발계" },
} as const;
export const earChannelLabel = (ch: EarChannel) => CHANNEL[ch].label;

const DEVICE_KEY = "ear_pipeline_device_id";

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = `pipeline-web-${crypto.randomUUID()}`; localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

export function loadTokens(ch: EarChannel = "prod"): EarTokens | null {
  try { const raw = localStorage.getItem(CHANNEL[ch].tokensKey); return raw ? (JSON.parse(raw) as EarTokens) : null; } catch { return null; }
}
export function saveTokens(t: EarTokens, ch: EarChannel = "prod"): void { localStorage.setItem(CHANNEL[ch].tokensKey, JSON.stringify(t)); }
export function clearTokens(ch: EarChannel = "prod"): void { localStorage.removeItem(CHANNEL[ch].tokensKey); }

/** access 토큰 페이로드 — 역할 안내용 표시에만 쓴다. 판정은 서버가 한다 */
export function tokenClaims(ch: EarChannel = "prod"): { sub?: string; role?: string } {
  const t = loadTokens(ch);
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

async function rawFetch(path: string, init: RequestInit = {}, token?: string, ch: EarChannel = "prod"): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${CHANNEL[ch].proxy}${path}`, { ...init, headers });
}

async function toError(res: Response): Promise<EarApiError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error_code?: string; field?: string };
  return new EarApiError(res.status, body.error_code, body.message ?? `HTTP ${res.status}`, body.field);
}

/**
 * 401 복구 — **refresh 회전을 쓰지 않고 SSO 재교환으로 통일한다** (2026-09-08).
 *
 * 종전에는 401마다 각 호출이 refresh를 불렀는데, 발행 화면처럼 요청이 동시에 나가는
 * 곳에서는 같은 refresh 토큰이 두 번 제출돼 서버의 재사용 탐지(탈취 의심 → 전 세션
 * 무효화 + ERROR 알림)를 울렸다(실서버 실측 — `tickets/ai/archive/ear-token-refresh-race.md`).
 * SSO 교환(`/api/ear/sso`)은 회전 상태가 없어 겹쳐 불러도 안전하고, 이 콘솔은 어차피
 * Supabase 로그인이 전제라 사용자 입력 없이 끝난다. 동시 401은 채널별로 재교환 1회를 공유한다.
 */
const reconnectInFlight: Partial<Record<EarChannel, Promise<boolean>>> = {};
function reconnectEar(ch: EarChannel): Promise<boolean> {
  reconnectInFlight[ch] ??= connectEar(ch)
    .then(() => true)
    .catch(() => { clearTokens(ch); return false; })
    .finally(() => { delete reconnectInFlight[ch]; });
  return reconnectInFlight[ch]!;
}

/** 제품 API 호출 — 401 이면 SSO 재교환 1회 후 재시도, 그래도 실패면 EarAuthError */
export async function earFetch<T>(path: string, init: RequestInit = {}, ch: EarChannel = "prod"): Promise<T> {
  const t = loadTokens(ch);
  if (!t) throw new EarAuthError();
  let res = await rawFetch(path, init, t.access_token, ch);
  if (res.status === 401) {
    if (!(await reconnectEar(ch))) throw new EarAuthError();
    res = await rawFetch(path, init, loadTokens(ch)!.access_token, ch);
    if (res.status === 401) { clearTokens(ch); throw new EarAuthError(); }
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

/**
 * Supabase 세션 → 서버 SSO(`/api/ear/sso` 또는 `/api/ear-dev/sso`) → 제품 토큰. 사용자 입력 없이 연결된다.
 * 같은 이메일의 제품 관리자 계정이 그 서버에 없으면 서버가 403으로 알려준다.
 */
export async function connectEar(ch: EarChannel = "prod"): Promise<{ role: string; sub: string }> {
  const res = await fetch(`${CHANNEL[ch].proxy}/sso`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: deviceId() }),
  });
  if (!res.ok) throw await toError(res);
  const b = (await res.json()) as EarTokens;
  saveTokens({ access_token: b.access_token, refresh_token: b.refresh_token }, ch);
  const claims = tokenClaims(ch);
  return { role: claims.role ?? "?", sub: claims.sub ?? "?" };
}

// ── 제품 API 타입 (spec은 docs/changes/pending/admin-web-console.md — admin-api 계약) ──

export interface EarTopic {
  id: string; name: string; parent_category: string;
  is_visible: boolean; display_order: number; content_count: number;
  /** 발행 중 + 라이선스 미만료 건수 — 노출 켜기 판정 기준(admin.md 4.5, KAN-58). 배포 전 서버는 주지 않는다 */
  visible_content_count?: number;
}
export interface EarContent {
  id: string; title: string; description: string; origin: string; status: string;
  author_name: string | null; source_name: string; source_url: string | null;
  duration_sec: number; thumbnail_url: string; content_version: number;
  license_expires_at: string | null; published_at: string; withdrawn_at: string | null;
  topics: { topic_id: string; name: string }[];
  /** 마지막 적용 추천 메타 파일의 형식 버전·시각 (admin-api 8장, 2026-09-11). null = 받은 적 없음 */
  enrichment_schema_version: number | null; enriched_at: string | null;
  /** 요청에 enrichment_file 이 있었을 때만 (4.6·4.10) */
  enrichment_applied?: boolean; enrichment_rejected_reason?: string;
  /** 요청에 script_file 이 있었을 때만 (4.6·4.10, KAN-71) — 서버 검증에 어긋나면 파일만 거부되고 업로드는 진행된다 */
  script_applied?: boolean; script_rejected_reason?: string;
  /** 자막 세그먼트(content_scripts) 적재 여부 (admin-api 8장, KAN-71) */
  has_script?: boolean;
}
/** 현재 추천 메타 형식 버전 — 원본은 서버 CURRENT_ENRICHMENT_SCHEMA_VERSION(admin-api 4.6 "현재 형식 2"). 목록 응답이 현재 버전을 싣게 되면(BE 티켓) 그 값으로 바꾼다 */
export const ENRICHMENT_SCHEMA_VERSION_FALLBACK = 2;
export const listEarJobCategories = () => earFetch<{ items: { name: string }[] }>("/job-categories");

export const listEarTopics = () => earFetch<{ items: EarTopic[] }>("/admin/topics");
export const createEarTopic = (name: string, parent_category: string, display_order?: number) =>
  earFetch<EarTopic>("/admin/topics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, parent_category, ...(display_order != null ? { display_order } : {}) }) });
export const patchEarTopic = (id: string, fields: Partial<{ name: string; parent_category: string; is_visible: boolean; display_order: number }>) =>
  earFetch<EarTopic>(`/admin/topics/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });
export const deleteEarTopic = (id: string) => earFetch<void>(`/admin/topics/${id}`, { method: "DELETE" });

export const listEarContents = (status: string, offset: number, limit = 20) =>
  earFetch<{ items: EarContent[]; total: number }>(`/admin/contents?offset=${offset}&limit=${limit}${status ? `&status=${status}` : ""}`);
/** 단건 — admin-api 에 GET /admin/contents/:id 가 없어(3장) 목록을 넘기며 찾는다. 콘텐츠가 수백 건을 넘기 전까지는 충분하다 */
export async function findEarContent(id: string): Promise<EarContent | null> {
  for (let off = 0; ; off += 50) {
    const d = await listEarContents("", off, 50);
    const hit = d.items.find((c) => c.id === id);
    if (hit) return hit;
    if (off + 50 >= d.total || d.items.length === 0) return null;
  }
}
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

/** 재발행 — 같은 content_id 에 오디오(·메타) 교체, content_version +1 (admin-api 4.10 — 백엔드 구현 대기: 404 면 아직 없는 것) */
export function republishEarContent(contentId: string, parts: { audio?: File; thumbnail?: File; enrichment?: File; script?: File; payload?: Partial<Pick<UploadPayload, "title" | "description" | "source_name" | "topic_ids" | "sources">> }): Promise<EarContent> {
  const fd = new FormData();
  if (parts.payload) fd.append("payload", JSON.stringify(parts.payload));
  if (parts.audio) fd.append("audio", parts.audio);
  if (parts.thumbnail) fd.append("thumbnail", parts.thumbnail);
  if (parts.enrichment) fd.append("enrichment_file", parts.enrichment); // 단독 전송이면 content_version 무변경·재생 위치 보존 (4.10)
  if (parts.script) fd.append("script_file", parts.script); // 자막 세그먼트 — 단독 전송이면 역시 버전 무변경 (4.10, 기존 발행분 소급 경로)
  return earFetch<EarContent>(`/admin/contents/${contentId}`, { method: "PATCH", body: fd });
}

export function uploadEarContent(payload: UploadPayload, audio: File, thumbnail: File, enrichment?: File | null, script?: File | null): Promise<EarContent> {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  fd.append("audio", audio);
  fd.append("thumbnail", thumbnail);
  if (enrichment) fd.append("enrichment_file", enrichment); // 추천 메타(metadata-pipeline 4.4) — 있으면 첫 발행부터 v2
  if (script) fd.append("script_file", script); // 자막 세그먼트(admin-api 4.6 script_file, KAN-72) — TTS 단계 산출물
  return earFetch<EarContent>("/admin/contents", { method: "POST", body: fd });
}

// ── 편성 미리보기 (admin-api `GET /admin/drip/preview` — 추천 검증 콘솔, 2026-09-18) ──

export interface EarDripTopicRef { topic_id: string; name: string | null }
export interface EarDripWeight { key: string; name: string | null; weight: number }
export interface EarDripBreakdown {
  embedding: number | null; signal: number | null; meta: number | null;
  signal_items: {
    topic_preference: number | null; author_preference: number | null; keyword_match: number | null;
    format_preference: number | null; duration_closeness: number | null;
  } | null;
  meta_items: {
    topic_match: number | null; freshness: number | null; popularity: number | null; difficulty_fit: number | null;
    career_fit: number | null; series_continuity: number | null; exposure_fatigue: number | null;
  };
}
export interface EarDripCandidate {
  content_id: string; title: string; author_name: string | null; source_name: string; duration_sec: number;
  published_at: string; difficulty: string | null; format: string | null; is_evergreen: boolean | null;
  series_id: string | null; episode_no: number | null; topics: EarDripTopicRef[];
  play_count: number; complete_count: number; has_embedding: boolean;
  score: number; is_series_continuation: boolean; breakdown: EarDripBreakdown;
  /** 최종 편성분이면 1부터, 아니면 null */
  pick_order: number | null;
  exposure_count: number | null; is_outside_interests: boolean | null;
}
export interface EarDripPreview {
  computed_at: string; service_date: string;
  user: { id: string; email: string | null; nickname: string | null; tier: string; job_category: string | null; years_of_experience: number | null; onboarding_completed: boolean };
  skip_reason: "no_interests" | "unfinished_inventory" | "plan_disabled" | null;
  unfinished_count: number | null; unfinished_limit: number; drip_count: number | null; discovery_count: number | null;
  interests: (EarDripTopicRef & { source: string })[]; removed_topics: EarDripTopicRef[];
  /** 자동 확장 판정(drip-scheduling 4.5 — admin-api 4.16, 2026-09-30). 미리보기는 저장하지 않으므로 interests 에는 아직 없고, 편성 계산은 반영됐다고 가정한 결과다 */
  auto_expand: {
    action: "none" | "add" | "replace" | "expire"; reason: string;
    add_topic: EarDripTopicRef | null; remove_topic: EarDripTopicRef | null;
    candidates: (EarDripTopicRef & { completes: number; weight: number })[];
  } | null;
  preference: {
    is_cold_start: boolean | null; complete_signal_count: number | null; cold_start_threshold: number; signal_count: number | null;
    has_taste_embedding: boolean; duration_pref: { median_sec: number; p25_sec: number; p75_sec: number } | null;
    topic_weights: EarDripWeight[]; author_weights: EarDripWeight[]; keyword_weights: EarDripWeight[]; format_weights: EarDripWeight[];
    difficulty_affinity: Record<string, number> | null;
  };
  signals: { content_id: string; title: string | null; action: string; created_at: string }[];
  weights: { axes: { embedding: number; signal: number; meta: number }; signal_items: Record<string, number>; meta_items: Record<string, number>; meta_items_cold_start: Record<string, number>; discovery_items: Record<string, number> };
  regular: { pool_size: number; gated_out: { content_id: string; title: string; reason: string }[]; recent_drip_topics: EarDripTopicRef[]; candidates: EarDripCandidate[] } | null;
  discovery: { pool_size: number; quality_floor: number; typical_complete_rate: number; excluded: { content_id: string; title: string; reason: string }[]; candidates: EarDripCandidate[] } | null;
  discovery_error: string | null;
  today_placed: { content_id: string; title: string }[];
}
/** 매 호출이 서버에서 새로 계산한다(서버도 no-store). 브라우저 캐시도 끈다 */
export const getEarDripPreview = (email: string, ch: EarChannel = "prod") =>
  earFetch<EarDripPreview>(`/admin/drip/preview?email=${encodeURIComponent(email)}`, { cache: "no-store" }, ch);

// ── 추천 테스트 (admin-api 4.17 — 개발계 전용, changes/pending/admin-api-recommend-test.md) ──

export type RecommendTestAction = "play" | "complete" | "save" | "unsave" | "delete" | "replay";

export interface RecommendTestAccount {
  environment: string;
  user: {
    id: string; email: string | null; nickname: string | null; tier: string; onboarding_completed: boolean;
    job_category: string | null; job_title: string | null; years_of_experience: number | null;
  };
  interests: { topic_id: string; name: string | null; source: string }[];
  library: { item_id: string; content_id: string; title: string | null; source: string; status: string; added_at: string; completed_at: string | null }[];
}
export interface RecommendTestActionResult {
  action: RecommendTestAction; content_id: string; performed_at: string; effects: string[]; preference_rebuilt: boolean;
}
/** 앱 탐색 화면의 피드와 같은 본문(explore-api 4.1) */
export interface EarExploreFeed {
  sections: {
    key: string; title: string; topic: { id: string; name: string } | null; period: string | null;
    items: {
      content: { id: string; title: string; author_name: string | null; source_name: string; duration_sec: number; topic_ids: string[] };
      library: { item_id: string; source: string; status: string } | null;
      is_counted_today: boolean;
    }[];
  }[];
  daily_play_limit: number | null;
  daily_play_count: number | null;
  service_date: string;
}

/** 추천 테스트 호출은 전부 개발계 채널이다 — 운영 채널로 부르면 서버가 409 로 거절한다 */
const DEV: EarChannel = "dev";
const json = (body: unknown): RequestInit => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const getRecommendTestAccount = () => earFetch<RecommendTestAccount>("/admin/recommend-test/account", { cache: "no-store" }, DEV);
export const getRecommendTestFeed = () => earFetch<EarExploreFeed>("/admin/recommend-test/feed", { cache: "no-store" }, DEV);
export const postRecommendTestAction = (action: RecommendTestAction, content_id: string) =>
  earFetch<RecommendTestActionResult>("/admin/recommend-test/actions", { method: "POST", ...json({ action, content_id }) }, DEV);
export const putRecommendTestInterests = (topic_ids: string[]) =>
  earFetch<void>("/admin/recommend-test/interests", { method: "PUT", ...json({ topic_ids }) }, DEV);
export const putRecommendTestCareer = (body: { job_category: string | null; job_title: string | null; years_of_experience: string | null }) =>
  earFetch<void>("/admin/recommend-test/career", { method: "PUT", ...json(body) }, DEV);
export const resetRecommendTest = () => earFetch<void>("/admin/recommend-test/reset", { method: "POST" }, DEV);
/** 콘텐츠·주제 목록은 기존 관리자 API 를 개발계 채널로 부른다 */
export const listEarContentsOn = (ch: EarChannel, status: string, offset: number, limit = 50) =>
  earFetch<{ items: EarContent[]; total: number }>(`/admin/contents?offset=${offset}&limit=${limit}${status ? `&status=${status}` : ""}`, {}, ch);
export const listEarTopicsOn = (ch: EarChannel) => earFetch<{ items: EarTopic[] }>("/admin/topics", {}, ch);

/**
 * 추천 평가 스냅샷(admin-api 4.18) — 오프라인 평가기(`backend: npm run eval:recommend`)의 입력 파일. 익명이지만 행동
 * 이력이라 브라우저에서 내려받아 저장소 밖(`backend/eval/snapshots/`)에 둔다. 수 MB — 파싱 없이 문자열로 받는다
 */
export async function downloadEarEvalSnapshot(ch: EarChannel): Promise<{ filename: string; blob: Blob }> {
  const json = await earFetch<Record<string, unknown>>("/admin/recommend-eval/snapshot", { cache: "no-store" }, ch);
  const env = typeof json.environment === "string" && json.environment ? json.environment : ch;
  const exportedAt = typeof json.exported_at === "string" ? json.exported_at.slice(0, 10) : "snapshot";
  return { filename: `${env}-${exportedAt}.json`, blob: new Blob([JSON.stringify(json)], { type: "application/json" }) };
}
