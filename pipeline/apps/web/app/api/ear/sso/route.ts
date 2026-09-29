import { NextRequest } from "next/server";
import { earSso } from "@/lib/ear-proxy";

/** 운영 제품 SSO — Supabase 세션 → `/auth/pipeline-login` 토큰 교환. 구현은 `lib/ear-proxy.ts` */
export async function POST(req: NextRequest) { return earSso(req, "prod"); }
