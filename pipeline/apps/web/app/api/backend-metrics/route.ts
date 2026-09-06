import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase-server";

/**
 * 서버 자원·DB 부하 — 서버 상태 탭의 두 번째 데이터 원천 (Supabase 로그인 필수).
 *
 * 제품 서버의 `GET /admin/system-stats`(관리자 가드)를 서버에서 대신 호출한다.
 * 인증은 SSO 어서션(`/api/ear/sso`와 같은 서명 — EAR_SSO_SECRET)으로 제품 토큰을
 * 교환하되, **토큰을 모듈 캐시에 들고 만료 전까지 재사용**한다 — 15초 폴링마다
 * 세션 행이 쌓이면 안 된다. 토큰은 서버에만 있고 브라우저로 나가지 않는다.
 */
const EAR_BASE = () => (process.env.EAR_API_BASE_URL ?? "https://api.earcast.co.kr/api/v1").replace(/\/$/, "");
const DEVICE_ID = "pipeline-backend-metrics";
const UPSTREAM_TIMEOUT_MS = 8000;
/** 만료 이 시간 전부터는 새 토큰으로 교체한다 */
const TOKEN_SLACK_MS = 60_000;

const b64u = (b: Buffer) => b.toString("base64url");

function signAssertion(email: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64u(Buffer.from(JSON.stringify({ typ: "pipeline_sso", email, iat: now, exp: now + 60 })));
  const sig = b64u(createHmac("sha256", secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

let cached: { token: string; expiresAtMs: number } | null = null;

async function adminToken(email: string, secret: string): Promise<string> {
  if (cached && cached.expiresAtMs - TOKEN_SLACK_MS > Date.now()) return cached.token;

  const res = await fetch(`${EAR_BASE()}/auth/pipeline-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assertion: signAssertion(email, secret), device_id: DEVICE_ID }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SSO 교환 실패 (${res.status}) — 같은 이메일의 관리자 계정이 필요하다`);

  const body = (await res.json()) as { access_token: string; access_token_expires_at: string };
  cached = { token: body.access_token, expiresAtMs: Date.parse(body.access_token_expires_at) };
  return cached.token;
}

export async function GET() {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ message: "로그인이 필요합니다" }, { status: 401 });

  // 개발 전용 스텁 — 운영 빌드에서는 절대 켜지지 않는다
  if (process.env.NODE_ENV !== "production" && process.env.BACKEND_LOGS_STUB === "1") {
    return NextResponse.json(stubStats());
  }

  if (!user.email) return NextResponse.json({ message: "파이프라인 계정에 이메일이 없어요" }, { status: 400 });
  const secret = process.env.EAR_SSO_SECRET;
  if (!secret) return NextResponse.json({ message: "EAR_SSO_SECRET 미설정 — 서버 env 확인" }, { status: 500 });

  try {
    let res = await fetchStats(await adminToken(user.email, secret));
    if (res.status === 401) {
      // 토큰이 캐시와 서버 사이에서 만료된 경우 — 한 번만 새로 교환한다
      cached = null;
      res = await fetchStats(await adminToken(user.email, secret));
    }
    if (res.status === 404) {
      return NextResponse.json(
        { message: "제품 서버에 system-stats가 아직 배포되지 않았습니다" },
        { status: 503 },
      );
    }

    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "제품 서버 조회 실패";
    return NextResponse.json({ message }, { status: 502 });
  }
}

async function fetchStats(token: string): Promise<Response> {
  return fetch(`${EAR_BASE()}/admin/system-stats`, {
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

function stubStats() {
  return {
    host: {
      load_1m: 0.42, load_5m: 0.31, load_15m: 0.28, cpu_count: 2, cpu_used_percent: 23.5,
      mem_total_bytes: 4 * 1024 ** 3, mem_available_bytes: 1.6 * 1024 ** 3, uptime_sec: 86400 * 12,
    },
    db: {
      connections: { total: 12, active: 2, idle: 9, idle_in_transaction: 1, waiting: 0, longest_active_sec: 0.8, max: 100 },
      slow_queries: [
        { pid: 4211, state: "active", duration_sec: 0.8, query: "SELECT c.* FROM contents c JOIN drip_slots d ON d.content_id = c.id WHERE d.user_id = $1" },
      ],
      cache_hit_ratio: 0.997, xact_commit: 182_340, xact_rollback: 214, deadlocks: 0, size_bytes: 312 * 1024 ** 2,
    },
    measured_at: new Date().toISOString(),
  };
}
