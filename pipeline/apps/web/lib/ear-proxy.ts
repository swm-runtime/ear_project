import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase-server";

/**
 * 제품(ear) API 프록시·SSO 의 공통 구현 — **연결 대상(채널)만 다르고 절차는 같다.**
 *
 * - `prod` — 운영 API(`EAR_API_BASE_URL`, 기본 api.earcast.co.kr). 발행·편성 미리보기(실배포)가 쓴다
 * - `dev`  — 개발계 API(`EAR_DEV_API_BASE_URL`, 기본 api-dev.earcast.co.kr). **추천 테스트**가 쓴다 — 행동 버튼이
 *            실제 신호·라이브러리를 쓰는 도구라 운영에 붙이지 않는다(features/admin.md 4.7). 개발계 서버의
 *            `PIPELINE_SSO_SECRET` 과 짝인 `EAR_DEV_SSO_SECRET` 이 따로 필요하다(두 서버의 비밀은 다르다)
 *
 * 브라우저가 제품 서버를 직접 부르면 CORS 오리진을 제품 서버에 추가해야 한다. 이 프록시는 서버 사이 호출이라
 * 그럴 필요가 없고, **Supabase 로그인(팀원)된 세션만** 통과시켜 제품 API 가 임의 오리진에 노출되지 않게 한다.
 * 제품 쪽 권한 판정은 그대로 제품 JWT(role=admin)가 한다 — 여기는 통로일 뿐이다.
 * 허용 경로는 인증(auth/*)과 관리자(admin/*)뿐 — 사용자향 API 를 프록시로 열지 않는다.
 */
export type EarChannel = "prod" | "dev";

const ALLOWED = /^(auth|admin)\//;

export function earTarget(channel: EarChannel): { base: string; secret: string | undefined } {
  const strip = (s: string) => s.replace(/\/$/, "");
  if (channel === "dev") {
    return {
      base: strip(process.env.EAR_DEV_API_BASE_URL ?? "https://api-dev.earcast.co.kr/api/v1"),
      secret: process.env.EAR_DEV_SSO_SECRET,
    };
  }
  return {
    base: strip(process.env.EAR_API_BASE_URL ?? "https://api.earcast.co.kr/api/v1"),
    secret: process.env.EAR_SSO_SECRET,
  };
}

export async function earProxy(req: NextRequest, params: Promise<{ path: string[] }>, channel: EarChannel): Promise<Response> {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ message: "파이프라인 로그인이 필요합니다" }, { status: 401 });

  const { path } = await params;
  const joined = path.join("/");
  if (!ALLOWED.test(joined) || joined.includes("..")) {
    return NextResponse.json({ message: "허용되지 않는 경로" }, { status: 404 });
  }

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "idempotency-key"]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }

  const url = `${earTarget(channel).base}/${joined}${req.nextUrl.search}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const upstream = await fetch(url, {
    method: req.method,
    headers,
    // multipart(업로드)의 경계 문자열을 보존하려면 본문을 그대로 흘린다
    body: hasBody ? await req.blob() : undefined,
    redirect: "manual",
  });

  const res = new NextResponse(upstream.body, { status: upstream.status });
  const ct = upstream.headers.get("content-type");
  if (ct) res.headers.set("content-type", ct);
  return res;
}

const b64u = (b: Buffer) => b.toString("base64url");

/** HS256 JWT — 수명 60초. 라이브러리 없이 서명만 하면 되는 크기라 직접 만든다 */
export function signAssertion(email: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64u(Buffer.from(JSON.stringify({ typ: "pipeline_sso", email, iat: now, exp: now + 60 })));
  const sig = b64u(createHmac("sha256", secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

/**
 * 제품 SSO — Supabase 로그인(팀원) 세션의 이메일로 어서션을 서명해 제품 서버 `/auth/pipeline-login` 과 토큰을
 * 교환한다. 비밀은 이 서버에만 있고 브라우저는 결과 토큰만 받는다. 제품 쪽 판정은 그대로 제품 서버가 한다 —
 * 같은 이메일의 관리자 계정이 없으면 403 이 돌아온다. 정적 라우트가 캐치올보다 우선하므로 이 경로는 프록시를 타지 않는다.
 */
export async function earSso(req: NextRequest, channel: EarChannel): Promise<Response> {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ message: "파이프라인 로그인이 필요합니다" }, { status: 401 });
  if (!user.email) return NextResponse.json({ message: "파이프라인 계정에 이메일이 없어요" }, { status: 400 });

  const { base, secret } = earTarget(channel);
  if (!secret) {
    const name = channel === "dev" ? "EAR_DEV_SSO_SECRET" : "EAR_SSO_SECRET";
    return NextResponse.json({ message: `${name} 미설정 — 서버 env 확인` }, { status: 500 });
  }

  const { device_id } = (await req.json().catch(() => ({}))) as { device_id?: string };
  if (!device_id) return NextResponse.json({ message: "device_id가 필요해요" }, { status: 400 });

  const upstream = await fetch(`${base}/auth/pipeline-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assertion: signAssertion(user.email, secret), device_id }),
  });

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
