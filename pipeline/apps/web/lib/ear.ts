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
import { normalizeSearchQueryLogSummary, type RawSearchQueryLogSummary } from "./search-query-log-normalize";

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
  /** 주제의 시장 — 지금 서버 목록(admin-api 4.1)은 싣지 않는다(BE 요청 2026-10-20). 오면 이 값으로 가른다 */
  market?: "kr" | "global";
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
  /** 추천 스코어링에 쓰이는 임베딩이 있는가(admin-api 8장, 2026-10-13). false = 없거나 오디오 재발행 뒤 미갱신 — 메타 형식이 최신이어도 다시 뽑을 대상. 배포 전 서버면 없다 */
  has_current_embedding?: boolean;
  /** 시리즈 편이면 편의 값(admin-api 8장 · 4.6, 2026-10-17 KAN-134). 단일 편은 null */
  series_id?: string | null; episode_no?: number | null; total_episodes?: number | null;
}
/** 현재 추천 메타 형식 버전 — 원본은 서버 CURRENT_ENRICHMENT_SCHEMA_VERSION(admin-api 4.6). 3 = 해시태그 포함(KAN-162 운영 배포 뒤 KAN-164). **워커 ENRICH_TAGS=1 과 같은 시점에 움직인다** — 콘솔만 먼저 올리면 발행분 전부가 "구형 v2"로 보이는데 다시 뽑아도 태그가 붙지 않는다(2026-10-13 먼저 올렸다가 되돌림 #1486). 2026-10-14 AI 서버 워커 env.prod 에 ENRICH_TAGS=1 을 넣고 재기동한 뒤 3으로 올렸다 */
export const ENRICHMENT_SCHEMA_VERSION_FALLBACK = 3;
export const listEarJobCategories = () => earFetch<{ items: { name: string }[] }>("/job-categories");

export const listEarTopics = () => earFetch<{ items: EarTopic[] }>("/admin/topics");
/** 주제 생성 — 이 콘솔 인스턴스의 시장을 싣는다(admin-api 4.2 `market`, 없으면 서버가 kr). 2026-10-20 전에는 싣지 않아 글로벌 콘솔이 만든 주제가 kr 로 생길 수 있었다 */
export const createEarTopic = (name: string, parent_category: string, display_order?: number) =>
  earFetch<EarTopic>("/admin/topics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, parent_category, market: contentMarket(consoleMarket()).market, ...(display_order != null ? { display_order } : {}) }) });

/**
 * 이 콘솔 시장의 주제만 (2026-10-20) — 서버 목록이 두 시장 주제를 함께 주고 시장 칸이 없다(admin-api 4.1).
 * 시장 칸이 오면 그 값으로, 없으면 이 인스턴스 파이프라인의 중분류 이름으로 가른다(제품 주제 = 파이프라인 중분류 1:1, 2026-09-06 체계 통일).
 * others = 다른 시장(또는 체계에 없는) 주제 — 화면은 숨기고 수만 알린다
 */
export function splitConsoleTopics(items: EarTopic[], market: "kr" | "global", pipelineNames: string[]): { mine: EarTopic[]; others: EarTopic[] } {
  const names = new Set(pipelineNames);
  const mine = (t: EarTopic) => (t.market ? t.market === market : names.has(t.name));
  return { mine: items.filter(mine), others: items.filter((t) => !mine(t)) };
}
/** 브라우저에서 이 콘솔의 시장 — kr | global */
export const consoleMarketValue = (): "kr" | "global" => contentMarket(consoleMarket()).market;
export const patchEarTopic = (id: string, fields: Partial<{ name: string; parent_category: string; is_visible: boolean; display_order: number }>) =>
  earFetch<EarTopic>(`/admin/topics/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });
export const deleteEarTopic = (id: string) => earFetch<void>(`/admin/topics/${id}`, { method: "DELETE" });

/** 이 콘솔 인스턴스의 시장(kr·global) — 서버 레이아웃이 <html data-market> 에 적는다. 제품 서버 하나를 두 시장이 같이 쓰므로 목록은 시장으로 가른다(admin-api 4.5) */
const consoleMarket = (): string | undefined => (typeof document !== "undefined" ? document.documentElement.dataset.market : undefined);

/**
 * 발행 payload 의 시장·언어 (global-api 4.9 · BE KAN-190 1단계, 2026-10-19 BE 요청) — 허용 조합은 kr+ko, global+en 뿐이다.
 * 두 트랙 모두 명시해서 보낸다: 서버가 필수로 바꾸면(KAN-190 2단계) 빠진 쪽이 400 이 되고, 지금 빠뜨리면 GLOBAL 콘텐츠가 kr·ko 로 저장된다.
 * 인스턴스 시장을 모르면(서버 렌더 등) 한국판으로 둔다 — 레이아웃이 늘 <html data-market> 을 적으므로 브라우저 발행에서는 일어나지 않는다
 */
export function contentMarket(market: string | undefined): { market: "kr" | "global"; language: "ko" | "en" } {
  return market === "global" ? { market: "global", language: "en" } : { market: "kr", language: "ko" };
}
export const listEarContents = (status: string, offset: number, limit = 20) => {
  const market = consoleMarket();
  return earFetch<{ items: EarContent[]; total: number }>(`/admin/contents?offset=${offset}&limit=${limit}${status ? `&status=${status}` : ""}${market ? `&market=${market}` : ""}`);
};
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
  market?: "kr" | "global"; language?: "ko" | "en"; // 비우면 uploadEarContent 가 이 콘솔 인스턴스의 값으로 채운다 (contentMarket)
}

/** 재발행 — 같은 content_id 에 오디오(·메타) 교체, content_version +1 (admin-api 4.10 — 백엔드 구현 대기: 404 면 아직 없는 것) */
export function republishEarContent(contentId: string, parts: { audio?: File; lossless?: File; thumbnail?: File; enrichment?: File; script?: File; payload?: Partial<Pick<UploadPayload, "title" | "description" | "source_name" | "topic_ids" | "sources">> }): Promise<EarContent> {
  const fd = new FormData();
  if (parts.payload) fd.append("payload", JSON.stringify(parts.payload));
  if (parts.audio) fd.append("audio", parts.audio);
  if (parts.lossless) fd.append("audio_lossless", parts.lossless); // 무손실(Pro, KAN-141) — 오디오 교체는 음질 세트라 안 보내면 그 음질 행이 지워진다
  if (parts.thumbnail) fd.append("thumbnail", parts.thumbnail);
  if (parts.enrichment) fd.append("enrichment_file", parts.enrichment); // 단독 전송이면 content_version 무변경·재생 위치 보존 (4.10)
  if (parts.script) fd.append("script_file", parts.script); // 자막 세그먼트 — 단독 전송이면 역시 버전 무변경 (4.10, 기존 발행분 소급 경로)
  return earFetch<EarContent>(`/admin/contents/${contentId}`, { method: "PATCH", body: fd });
}

/** 제품 시리즈 (admin-api 4.24, KAN-134) — [시리즈 발행]이 먼저 만들고 그 id 를 업로드의 series_id 로 보낸다(spec/11 7장). 삭제는 없다 */
export interface EarSeries {
  id: string; title: string; description: string; total_episodes: number; status: "ongoing" | "completed";
  episode_counts: { published: number; withdrawn: number; expired: number }; max_published_episode_no: number | null;
  cover_url: string | null; // 시리즈 표지 (KAN-234, 2026-10-21) — 없으면 앱이 가장 앞 편 썸네일을 쓴다
  publisher_name: string | null; // 발행 이름 = 간행물 (BE #1883, KAN-247) — 앱 시리즈 화면 제목 아래 줄. 콘솔은 @ear/pipeline PUBLICATIONS 의 name 만 보낸다
  created_at: string; updated_at: string;
}
export const listEarSeries = () => earFetch<{ items: EarSeries[] }>("/admin/series");
/** 시리즈 표지 올리기 (admin-api 4.24 `PUT /admin/series/:id/cover`, KAN-234) — jpg/png/webp ≤5MB, 올리면 탐색 시리즈 카드·시리즈 화면이 이 그림을 쓴다 */
export function putEarSeriesCover(id: string, cover: File): Promise<EarSeries> {
  const fd = new FormData();
  fd.append("cover", cover);
  return earFetch<EarSeries>(`/admin/series/${id}/cover`, { method: "PUT", body: fd });
}
/** 파이프라인 표지(datasets/series/<id>/thumb-cover.png)를 제품 시리즈 표지로 올린다 (2026-10-28). 표지 파일이 없으면 null — 호출 쪽이 건너뛴다 */
export async function uploadPipelineSeriesCover(pipelineSeriesId: string, productSeriesId: string): Promise<EarSeries | null> {
  const res = await fetch(`/api/series/${pipelineSeriesId}?cover=1`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`표지 파일을 읽지 못했어요 (${res.status})`);
  const cover = new File([await res.blob()], `series-${pipelineSeriesId}-cover.png`, { type: "image/png" });
  return putEarSeriesCover(productSeriesId, cover);
}
export const createEarSeries = (body: { title: string; description: string; total_episodes: number; status?: "ongoing" | "completed"; publisher_name?: string | null }) =>
  earFetch<EarSeries>("/admin/series", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const patchEarSeries = (id: string, fields: Partial<{ title: string; description: string; total_episodes: number; status: "ongoing" | "completed"; publisher_name: string | null }>) =>
  earFetch<EarSeries>(`/admin/series/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });

export function uploadEarContent(payload: UploadPayload, audio: File, thumbnail: File, enrichment?: File | null, script?: File | null, lossless?: File | null): Promise<EarContent> {
  const fd = new FormData();
  fd.append("payload", JSON.stringify({ ...contentMarket(consoleMarket()), ...payload }));
  fd.append("audio", audio);
  if (lossless) fd.append("audio_lossless", lossless); // 무손실(Pro, KAN-141·142) — lib/audio-file.ts 스위치
  fd.append("thumbnail", thumbnail);
  if (enrichment) fd.append("enrichment_file", enrichment); // 추천 메타(metadata-pipeline 4.4) — 있으면 첫 발행부터 v2
  if (script) fd.append("script_file", script); // 자막 세그먼트(admin-api 4.6 script_file, KAN-72) — TTS 단계 산출물
  return earFetch<EarContent>("/admin/contents", { method: "POST", body: fd });
}

// ── 편성 미리보기 (admin-api `GET /admin/drip/preview?user_id=` — 추천 검증 콘솔, 2026-09-18 · user_id 조회 2026-10-22) ──

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
  /** 가명 사용자 — 서버가 이메일·닉네임을 조회하지도 싣지도 않는다(2026-10-22, changes/pending/drip-preview-user-id.md) */
  user: { id: string; tier: string; market: string; job_category: string | null; years_of_experience: number | null; onboarding_completed: boolean };
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
/** uuid 모양인가 — 입력 형식만 본다(대상 판정은 서버가 한다). 형식이 맞는데 400 이면 옛 계약 서버라는 뜻이다 */
export const isUuidLike = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());

/**
 * 이 서버가 아직 옛 계약(`?email=`만 받음)인가 — 형식이 맞는 `user_id`를 보냈는데 400 `VALIDATION_FAILED`가 오면 그렇다.
 * 콘솔은 dev 머지 즉시 배포되지만 운영 API 는 다음 dev→main 릴리스에 들어가서, 그 사이 운영은 이 상태다(2026-10-22).
 */
export const isDripPreviewNotDeployed = (e: unknown) =>
  e instanceof EarApiError && e.status === 400 && (e.errorCode === undefined || e.errorCode === "VALIDATION_FAILED");

/**
 * 매 호출이 서버에서 새로 계산한다(서버도 no-store). 브라우저 캐시도 끈다. 대상은 가명 `user_id`로만 고른다 —
 * 이메일 조회는 폐기됐다(2026-10-22). 열 때마다 서버가 감사 로그 1행을 남긴다(drip.preview_view)
 */
export const getEarDripPreview = (userId: string, ch: EarChannel = "prod") =>
  earFetch<EarDripPreview>(`/admin/drip/preview?user_id=${encodeURIComponent(userId.trim())}`, { cache: "no-store" }, ch);

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
/**
 * 탐색 피드 — 시리즈 카드 스위치(`SERIES_EXPLORE_CARDS_ENABLED`)가 켜진 서버는 `type: "series"` 행(`content` 없음)을 섞는다.
 * 이 화면은 편 단위로만 그리므로 시리즈 카드를 "[시리즈] 제목" 한 줄로 바꿔 싣는다(2026-10-22 — 개발계 스위치 켬 뒤
 * `Cannot read properties of undefined (reading 'id')`). 순위 비교 키는 시리즈 id 다.
 */
type RawFeedItem = EarExploreFeed["sections"][number]["items"][number] & {
  type?: "content" | "series";
  series?: { id: string; title: string } | null;
};
export const getRecommendTestFeed = async (): Promise<EarExploreFeed> => {
  const feed = await earFetch<EarExploreFeed>("/admin/recommend-test/feed", { cache: "no-store" }, DEV);
  return {
    ...feed,
    sections: feed.sections.map((s) => ({
      ...s,
      items: (s.items as RawFeedItem[]).flatMap((it) => {
        if (it.content) return [it];
        if (it.type === "series" && it.series) {
          return [{
            content: { id: it.series.id, title: `[시리즈] ${it.series.title}`, author_name: null, source_name: "", duration_sec: 0, topic_ids: [] },
            library: null,
            is_counted_today: false,
          }];
        }
        return [];
      }),
    })),
  };
};
export const postRecommendTestAction = (action: RecommendTestAction, content_id: string) =>
  earFetch<RecommendTestActionResult>("/admin/recommend-test/actions", { method: "POST", ...json({ action, content_id }) }, DEV);
export const putRecommendTestInterests = (topic_ids: string[]) =>
  earFetch<void>("/admin/recommend-test/interests", { method: "PUT", ...json({ topic_ids }) }, DEV);
export const putRecommendTestCareer = (body: { job_category: string | null; job_title: string | null; years_of_experience: string | null }) =>
  earFetch<void>("/admin/recommend-test/career", { method: "PUT", ...json(body) }, DEV);
export const resetRecommendTest = () => earFetch<void>("/admin/recommend-test/reset", { method: "POST" }, DEV);
/** 첫 드립 다시 실행(admin-api 4.17, 2026-10-13) — 초기화 뒤에 부르면 가입 직후의 첫 2편과 같다 */
export const runRecommendTestFirstDrip = () =>
  earFetch<{ status: string; item_count: number; completed_at: string | null }>("/admin/recommend-test/first-drip", { method: "POST" }, DEV);
/** 콘텐츠·주제 목록은 기존 관리자 API 를 개발계 채널로 부른다 */
export const listEarContentsOn = (ch: EarChannel, status: string, offset: number, limit = 50) =>
  earFetch<{ items: EarContent[]; total: number }>(`/admin/contents?offset=${offset}&limit=${limit}${status ? `&status=${status}` : ""}`, {}, ch);
export const listEarTopicsOn = (ch: EarChannel) => earFetch<{ items: EarTopic[] }>("/admin/topics", {}, ch);

/** 알고리즘 버전별 별점 (admin-api 4.19, drip-feedback.md 4.5) — 버전 역순 */
export interface EarDripFeedbackVersion {
  algorithm_version: string | null; placements: number; placed_users: number;
  first_placed_at: string | null; last_placed_at: string | null;
  ratings: number; rated_users: number; average_stars: number | null;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}
export const listEarDripFeedbackVersions = (ch: EarChannel = "prod") =>
  earFetch<{ items: EarDripFeedbackVersion[] }>("/admin/drip-feedback/versions", { cache: "no-store" }, ch);

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

/** 검색 질의 로그 요약 (admin-api 4.21, domain.md 5.7) — 한 행은 타이핑 묶음 하나다 */
/** `clicked`·`result_count`는 그 필드를 모르는 옛 서버 응답에서는 null이다 — 화면은 "-"로 적는다 */
export interface EarSearchQueryRank { query: string; searches: number; misses: number; clicked: number | null; result_count: number | null; has_more: boolean; last_searched_at: string }
export interface EarSearchQueryLogSummary {
  days: number; since: string;
  totals: {
    searches: number; misses: number; miss_rate: number | null; clicked: number | null; users: number; short_queries: number; filtered_searches: number;
    /** 하이브리드·교정(KAN-238) — 옛 서버는 없다(null) */
    corrected?: number | null; correction_rejected?: number | null; keyword_misses?: number | null; rescued?: number | null; semantic_unavailable?: number | null;
    /** 하이브리드 기록이 있는 검색과 그중 결과 없음(2026-10-27) — 위 비율의 분모. 옛 서버는 없다 */
    hybrid_searches?: number | null; hybrid_misses?: number | null;
  };
  daily: { date: string; searches: number; misses: number; clicked: number; rescued: number }[];
  missed: EarSearchQueryRank[];
  top: EarSearchQueryRank[];
  /** 의미 검색만으로 결과가 나온 질의(2026-10-27) — 옛 서버는 null(표를 숨긴다) */
  semantic: EarSearchSemanticRank[] | null;
  /** 오타 교정(2026-10-27) — 옛 서버는 null */
  corrections: EarSearchCorrectionRank[] | null;
}
export interface EarSearchSemanticRank {
  query: string; searches: number; clicked: number;
  contents: { content_id: string; title: string; topics: string[] }[];
  last_searched_at: string;
}
export interface EarSearchCorrectionRank { query: string; query_used: string; searches: number; rejected: number; clicked: number; last_searched_at: string }
/** 옛 서버 응답(필드 없음)도 화면이 읽을 수 있게 채운다 — 규칙은 `search-query-log-normalize.ts` */
export const getEarSearchQueryLogSummary = async (ch: EarChannel, days: number): Promise<EarSearchQueryLogSummary> =>
  normalizeSearchQueryLogSummary(await earFetch<RawSearchQueryLogSummary>(`/admin/search-query-logs/summary?days=${days}`, { cache: "no-store" }, ch));

// ── 서비스 지표 요약 (admin-api 4.22 — 로그 콘솔 "서비스 지표" 탭, 2026-10-08) ──

/** 전부 집계값과 user_id 뿐이다 — 서버가 이름·이메일을 싣지 않는다(루트 CLAUDE.md 개인정보 원칙) */
export interface EarInsightsListening {
  listen_sec: number; plays: number; completes: number; complete_rate: number | null; listeners: number; saves: number;
  avg_listen_sec_per_play: number | null; avg_listen_sec_per_listener: number | null;
}
export interface EarInsightsWeekday {
  /** ISO 요일 — 1 = 월 … 7 = 일 */
  weekday: number; label: string;
  /** 창 안 그 요일의 온전한 날 수 · 그중 접속자 기록이 있는 날 수 */
  days: number; active_days: number;
  avg_active_users: number | null; avg_listeners: number | null;
}
/** 코호트 표 한 칸 — `null`은 구간이 아직 끝나지 않음. `partial`은 접속 기록 이전 구간(재생만 잡혀 낮게 나온다) */
export type EarInsightsCohortCell = { returned: number; rate: number | null; partial: boolean } | null;
export interface EarInsightsCohortTable {
  /** 1 = 일별(D) · 7 = 주별(W) */
  span: number;
  /** 가입 뒤 몇 번째 구간 — 일별 [1, 7] · 주별 [1, 2, 3, 4] */
  offsets: number[];
  /** 접속 기록을 믿을 수 있는 첫 날(KST) — 이보다 앞에서 시작하는 칸이 `partial` */
  reliable_since: string;
  /** 최근 묶음 먼저. `start`는 일별 가입일 · 주별 가입 주 월요일(KST) */
  rows: { start: string; users: number; cells: EarInsightsCohortCell[] }[];
}
export interface EarInsightsTopContent { content_id: string; title: string; duration_sec: number; listen_sec: number; plays: number; listeners: number; completes: number; complete_rate: number | null; saves: number }
/** 서비스 지표 시장 필터 — null 이면 통합(admin-api 4.22 `market`, 2026-10-25) */
export type EarInsightsMarket = "kr" | "global";
/** 시장별 비교 한 줄(`by_market`) — 고른 시장과 무관하게 늘 두 시장이 온다 */
export interface EarInsightsMarketRow {
  market: EarInsightsMarket; users: number; signups_in_window: number; onboarding_completed: number;
  active_7d: number; listeners_7d: number; listen_sec: number; plays: number; paid_active: number;
}
export interface EarInsightsSummary {
  days: number; since: string; generated_at: string;
  /** 고른 시장 — 통합이면 null. 시장 필터를 모르는 옛 서버면 없다 */
  market?: EarInsightsMarket | null;
  /** 시장별 비교(global-api 4.10) — 배포 전 서버면 없다 */
  by_market?: EarInsightsMarketRow[];
  users: {
    total_signups: number; current: number; withdrawals: number; withdrawal_rate: number | null;
    onboarding_completed: number; onboarding_rate: number | null; trial_active: number;
    tiers: { light: number; daily: number; pro: number };
    /** 초대 코드 이벤트로 그 티어인 계정 수 — 운영 API 가 아직 모르면 없다(2026-10-10 추가) */
    tier_events?: { daily: number; pro: number };
    paid_active: number; paid_rate: number | null;
    /** 실결제를 한 번이라도 한 현재 계정(2026-10-26) — 옛 서버는 없다 */
    paid_ever?: number; paid_ever_rate?: number | null;
    activated: number; activation_rate: number | null;
    active_1d: number; active_7d: number; active_30d: number; stickiness: number | null;
    listeners_1d: number; listeners_7d: number; listeners_30d: number;
    listener_rate_1d: number | null; listener_rate_7d: number | null; listener_rate_30d: number | null;
    by_provider: { provider: string; count: number }[];
  };
  listening: { all_time: EarInsightsListening; window: EarInsightsListening };
  /** `active_users` — 그날 접속자(토큰 갱신한 사람). 기록이 없는 날은 null, 배포 전 서버면 키가 없다(2026-10-18 추가) */
  daily: { date: string; signups: number; withdrawals: number; plays: number; listeners: number; listen_sec: number; completes: number; active_users?: number | null }[];
  /** 요일별 평균 — 월~일 7칸, 창 안의 온전한 하루만(첫날 부분일·오늘 제외). 배포 전 서버면 없다 */
  weekday?: EarInsightsWeekday[];
  /** 접속자를 믿을 수 있는 첫 날(KST `YYYY-MM-DD`). 배포 전 서버면 없다 */
  active_users_since?: string;
  hourly: { hour: number; plays: number; listen_sec: number }[];
  top_users: { user_id: string; listen_sec: number; plays: number; completes: number; tier: string; signed_up_at: string; last_played_at: string }[];
  top_contents: EarInsightsTopContent[];
  /** 최근 24시간 인기 콘텐츠 — 창 안의 재생·완청·담기만, 청취자 수 순. 배포 전 서버면 없다(2026-10-18 추가) */
  recent_top_contents?: EarInsightsTopContent[];
  /** `recent_top_contents`의 창 시작(ISO) — 지금 - 24시간 */
  recent_since?: string;
  withdrawal_reasons: { reason_code: string | null; count: number }[];
  /** 알림 종류별 반응(보낸 뒤 2시간 안 재생, 2026-10-26) — 옛 서버는 없다 */
  push_reactions?: {
    type: string;
    rule: string | null;
    variant: string | null;
    sent: number;
    reacted: number;
    reaction_rate: number | null;
  }[];
  /** `bounded_*` = 정확히 가입 N일째 하루(바운디드, 2026-10-26) — 옛 서버는 없다 */
  retention: {
    day: number;
    cohort_size: number;
    returned: number;
    rate: number | null;
    bounded_cohort_size?: number;
    bounded_returned?: number;
    bounded_rate?: number | null;
  }[];
  /** 코호트 리텐션 — 일별 D1·D7 · 주별 W1~W4. 배포 전 서버면 없다(2026-10-18 추가) */
  retention_cohorts?: { daily: EarInsightsCohortTable; weekly: EarInsightsCohortTable };
  /** 주제별 수요·공급 — 관심 사용자가 많은 순(admin-api 4.22). 배포 전 서버면 없다 */
  topic_supply?: { topic_id: string; name: string; is_visible: boolean; published: number; published_in_window: number; interested_users: number; median_remaining: number; exhausted_users: number; low_users: number }[];
}
/** 열 때 1회 + [새로고침] — 자동 폴링하지 않는다(backend-monitoring.md 3장). 서버도 no-store */
export const getEarInsightsSummary = (ch: EarChannel, days: number, market: EarInsightsMarket | null = null) =>
  earFetch<EarInsightsSummary>(`/admin/insights/summary?days=${days}${market ? `&market=${market}` : ""}`, { cache: "no-store" }, ch);

// ── 추천 검증 (서비스 지표 — `GET /admin/insights/recommendations/*`, 2026-10-22) ──
// 사용자는 user_id 로만 온다 — 서버가 이름·이메일·제공자 ID·프로필 사진을 조회하지도 싣지도 않는다(루트 CLAUDE.md 개인정보 원칙).

export type EarInspectorSort = "listen" | "recent";
export interface EarInspectorUser {
  user_id: string; tier: string; signed_up_at: string; market: string; interest_count: number;
  plays_30d: number; listen_sec_30d: number; completes_30d: number; last_played_at: string | null;
}
export interface EarInspectorUsers { sort: EarInspectorSort; since: string; generated_at: string; users: EarInspectorUser[] }

/** 후보 표 한 줄 — 편성 미리보기의 후보 + 점수 순위·편성 여부 */
export type EarInspectorCandidate = EarDripCandidate & { rank: number; would_place: boolean };
export interface EarInspectorPick {
  pick_order: number; content_id: string; title: string; score: number; rank: number;
  is_series_continuation: boolean; is_outside_interests: boolean | null;
}
export interface EarInspectorDetail {
  user_id: string; generated_at: string;
  profile: {
    tier: string; market: string; signed_up_at: string; onboarding_completed: boolean; onboarding_step: string;
    onboarding_completed_at: string | null; job_category: string | null; years_of_experience: number | null;
    /** 커리어 적합도를 편성이 쓰는가 — KR 시장만 */
    career_used: boolean; is_auto_expand_enabled: boolean;
  };
  interests: {
    topic_id: string; name: string | null; source: string; is_active: boolean; is_user_removed: boolean;
    is_topic_visible: boolean | null; added_at: string; deactivated_at: string | null;
  }[];
  listening: {
    since: string;
    items: {
      content_id: string; title: string; topics: EarDripTopicRef[]; duration_sec: number;
      first_played_at: string | null; last_played_at: string | null; play_days: number; listen_sec: number;
      complete_count: number; last_completed_at: string | null; saved_at: string | null; max_reached_sec: number | null;
      listened_ratio: number | null;
    }[];
  };
  deliveries: {
    since: string;
    items: {
      service_date: string; added_at: string; content_id: string; title: string; topics: EarDripTopicRef[];
      source: string; algorithm_version: string | null; status: string; deleted: boolean;
      played_after: boolean; completed_after: boolean; feedback_stars: number | null;
    }[];
  };
  /** 현재 시점 재계산 — 점수는 저장되지 않으므로 과거 편성 당시 값이 아니다(`notice`) */
  explanation: {
    notice: string; computed_at: string; service_date: string;
    skip_reason: string | null; unfinished_count: number | null; unfinished_limit: number;
    drip_count: number | null; discovery_count: number | null;
    weights: EarDripPreview["weights"];
    preference: EarDripPreview["preference"] & {
      signal_total: number; signal_actions: Record<string, number>;
      signal_counts_by_topic: { topic_id: string; name: string | null; counts: Record<string, number>; total: number }[];
    };
    auto_expand: EarDripPreview["auto_expand"];
    exclusion_sources: { library_contents: number; permanently_excluded: number };
    regular: {
      pool_size: number; sql_filters: string[]; excluded_counts: Record<string, number>; candidate_count: number;
      series: { gated_out: { content_id: string; title: string; reason: string }[]; continuation_count: number };
      top: EarInspectorCandidate[]; picks: EarInspectorPick[];
    } | null;
    discovery: {
      pool_size: number; sql_filters: string[]; quality_floor: number; typical_complete_rate: number;
      excluded_counts: Record<string, number>; candidate_count: number;
      top: EarInspectorCandidate[]; picks: EarInspectorPick[];
    } | null;
    discovery_error: string | null;
    today_placed: { content_id: string; title: string }[];
  };
}
/** 열 때 1회 + [새로고침] — 자동 폴링하지 않는다. 서버도 no-store */
export const getEarInspectorUsers = (ch: EarChannel, sort: EarInspectorSort, limit = 30) =>
  earFetch<EarInspectorUsers>(`/admin/insights/recommendations/users?sort=${sort}&limit=${limit}`, { cache: "no-store" }, ch);
/** 상세는 열 때마다 서버가 감사 로그 1행을 남긴다(insights.recommendation_view) — 사용자를 고를 때만 부른다 */
export const getEarInspectorDetail = (ch: EarChannel, userId: string) =>
  earFetch<EarInspectorDetail>(`/admin/insights/recommendations/users/${encodeURIComponent(userId)}`, { cache: "no-store" }, ch);
