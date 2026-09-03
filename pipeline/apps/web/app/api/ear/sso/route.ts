import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase-server";

/**
 * 제품 SSO — Supabase 로그인(팀원) 세션의 이메일로 어서션을 서명해 제품 서버
 * `/auth/pipeline-login`과 토큰을 교환한다. `/publish`의 두 번째 로그인(GIS)을 없앤 경로다.
 *
 * 비밀(`EAR_SSO_SECRET`)은 이 서버에만 있고 브라우저는 결과 토큰만 받는다. 제품 쪽 판정은
 * 그대로 제품 서버가 한다 — 같은 이메일의 관리자 계정이 없으면 403이 돌아온다.
 * 정적 라우트가 캐치올(`/api/ear/[...path]`)보다 우선하므로 이 경로는 프록시를 타지 않는다.
 */
const BASE = () => (process.env.EAR_API_BASE_URL ?? "https://api.earcast.co.kr/api/v1").replace(/\/$/, "");

const b64u = (b: Buffer) => b.toString("base64url");

/** HS256 JWT — 수명 60초. 라이브러리 없이 서명만 하면 되는 크기라 직접 만든다 */
function signAssertion(email: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64u(Buffer.from(JSON.stringify({ typ: "pipeline_sso", email, iat: now, exp: now + 60 })));
  const sig = b64u(createHmac("sha256", secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

export async function POST(req: NextRequest) {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ message: "파이프라인 로그인이 필요합니다" }, { status: 401 });
  if (!user.email) return NextResponse.json({ message: "파이프라인 계정에 이메일이 없어요" }, { status: 400 });

  const secret = process.env.EAR_SSO_SECRET;
  if (!secret) return NextResponse.json({ message: "EAR_SSO_SECRET 미설정 — 서버 env 확인" }, { status: 500 });

  const { device_id } = (await req.json().catch(() => ({}))) as { device_id?: string };
  if (!device_id) return NextResponse.json({ message: "device_id가 필요해요" }, { status: 400 });

  const upstream = await fetch(`${BASE()}/auth/pipeline-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assertion: signAssertion(user.email, secret), device_id }),
  });

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
