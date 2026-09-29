import { NextRequest } from "next/server";
import { earProxy } from "@/lib/ear-proxy";

/** 운영 제품 API 프록시 — `/api/ear/<경로>` → `EAR_API_BASE_URL/<경로>`. 구현·규칙은 `lib/ear-proxy.ts` */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "prod"); }
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "prod"); }
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "prod"); }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "prod"); }
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return earProxy(req, ctx.params, "prod"); }
