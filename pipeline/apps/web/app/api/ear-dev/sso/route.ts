import { NextRequest } from "next/server";
import { earSso } from "@/lib/ear-proxy";

/** 개발계 제품 SSO — `EAR_DEV_SSO_SECRET` 으로 서명해 개발계 `/auth/pipeline-login` 과 교환한다 */
export async function POST(req: NextRequest) { return earSso(req, "dev"); }
