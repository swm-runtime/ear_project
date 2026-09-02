import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase-server";

/**
 * 제품(ear) API 프록시 — `/api/ear/<경로>` → `EAR_API_BASE_URL/<경로>`.
 *
 * 브라우저가 제품 서버를 직접 부르면 CORS 오리진을 제품 서버에 추가해야 한다. 이 프록시는
 * 서버 사이 호출이라 그럴 필요가 없고, **Supabase 로그인(팀원)된 세션만** 통과시켜
 * 파이프라인 웹이 열려 있는 한 제품 API가 임의 오리진에 노출되지 않게 한다.
 * 제품 쪽 권한 판정은 그대로 제품 JWT(role=admin)가 한다 — 여기는 통로일 뿐이다.
 *
 * 허용 경로는 인증(auth/*)과 관리자(admin/*)뿐 — 사용자향 API 를 프록시로 열지 않는다.
 */
const ALLOWED = /^(auth|admin)\//;
const BASE = () => (process.env.EAR_API_BASE_URL ?? "https://api.earcast.co.kr/api/v1").replace(/\/$/, "");

async function proxy(req: NextRequest, params: Promise<{ path: string[] }>): Promise<Response> {
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

  const url = `${BASE()}/${joined}${req.nextUrl.search}`;
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

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return proxy(req, ctx.params); }
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return proxy(req, ctx.params); }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return proxy(req, ctx.params); }
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return proxy(req, ctx.params); }
