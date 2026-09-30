import { NextRequest } from "next/server";
import { earProxy } from "@/lib/ear-proxy";

/**
 * 개발계 제품 API 프록시 — `/api/ear-dev/<경로>` → `EAR_DEV_API_BASE_URL/<경로>`.
 * 추천 테스트 탭(쓰기 있는 도구)만 쓴다 — 운영 프록시(`/api/ear`)와 채널만 다르다.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "dev"); }
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "dev"); }
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "dev"); }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "dev"); }
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "dev"); }
