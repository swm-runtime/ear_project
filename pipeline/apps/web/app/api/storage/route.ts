import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { assertKey, assertPrefix, listObjects, presignGet, presignPut, s3Configured } from "@/lib/storage";

/**
 * 로컬 워커용 S3 서명 URL 라우트 (spec/10 3.3 · spec/08 2장 자격증명 모델).
 * 팀원 노트북의 워커는 AWS 키 없이 여기서 목록·서명 URL 을 받아 S3 와 직접 통신한다. 인증은 공유 토큰(`PIPELINE_WORKER_TOKEN`, Bearer).
 * 키는 episodes/·sweeps/·datasets/ 만(버킷 정책과 같은 범위). `proxy.ts` 의 로그인 리다이렉트에서 `/api/` 는 제외돼 있다.
 *
 *   POST /api/storage  { op: "list", prefix, max? }        → { objects: [{ key, etag, size, last_modified }] }
 *                      { op: "get",  key }                 → { url, expires_in }
 *                      { op: "put",  key, content_type? }  → { url, expires_in }
 */
export const runtime = "nodejs";
const EXPIRES = 900;
const CONTENT_TYPE = /^[\w.+-]+\/[\w.+-]+(; ?charset=[\w-]+)?$/;

function authorized(req: Request): boolean {
  const expected = process.env.PIPELINE_WORKER_TOKEN ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!process.env.PIPELINE_WORKER_TOKEN) return NextResponse.json({ error: "PIPELINE_WORKER_TOKEN 미설정" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!s3Configured()) return NextResponse.json({ error: "PIPELINE_BUCKET 미설정" }, { status: 503 });
  let body: { op?: string; key?: unknown; prefix?: unknown; max?: unknown; content_type?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON 본문 필요" }, { status: 400 }); }
  try {
    switch (body?.op) {
      case "list": {
        const max = Math.min(Math.max(Number(body.max) || 1000, 1), 100_000);
        return NextResponse.json({ objects: await listObjects(assertPrefix(body.prefix), max) });
      }
      case "get":
        return NextResponse.json({ url: await presignGet(assertKey(body.key), EXPIRES), expires_in: EXPIRES });
      case "put": {
        const ct = typeof body.content_type === "string" && CONTENT_TYPE.test(body.content_type) ? body.content_type : "application/octet-stream";
        return NextResponse.json({ url: await presignPut(assertKey(body.key), ct, EXPIRES), expires_in: EXPIRES });
      }
      default:
        return NextResponse.json({ error: "op 은 list | get | put" }, { status: 400 });
    }
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    const clientFault = /형식 오류|허용되지 않는/.test(msg);
    if (!clientFault) console.error(`[api/storage] ${body?.op} 실패: ${msg}`);
    return NextResponse.json({ error: clientFault ? msg : "storage error" }, { status: clientFault ? 400 : 500 });
  }
}
