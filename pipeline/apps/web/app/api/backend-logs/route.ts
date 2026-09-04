import { NextRequest, NextResponse } from "next/server";
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { currentUser } from "@/lib/supabase-server";

/**
 * 백엔드(제품 API EC2) 컨테이너 로그 조회 — CloudWatch Logs 경유 (Supabase 로그인 필수).
 *
 * 백엔드 compose 가 awslogs 드라이버로 그룹 `/ear/<서비스>`, 스트림 `<서비스>` 에 쓴다
 * (`backend/docker-compose.prod.yml` · `backend/deploy/aws/README.md` "로그 → CloudWatch").
 * 여기서는 그 스트림의 꼬리(tail)를 읽는다 — 자격은 AI 서버 EC2 인스턴스 롤(logs:GetLogEvents)이며
 * 키를 env 에 두지 않는다(storage.ts 의 S3 와 같은 방식).
 */
const GROUPS: Record<string, { group: string; stream: string }> = {
  api: { group: process.env.BACKEND_LOG_GROUP_API ?? "/ear/api", stream: "api" },
  caddy: { group: process.env.BACKEND_LOG_GROUP_CADDY ?? "/ear/caddy", stream: "caddy" },
};
const MAX_LIMIT = 1000;
const MAX_MINUTES = 7 * 24 * 60; // 보관 7일 — 그보다 과거는 어차피 없다

let client: CloudWatchLogsClient | undefined;
const getClient = () =>
  (client ??= new CloudWatchLogsClient({ region: process.env.AWS_REGION || "ap-northeast-2" }));

/** 운영 Nest 로거가 ANSI 색 코드를 켠 채 찍는다(실로그 확인 2026-09-04) — 화면에 새기 전에 지운다 */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;
const clean = (message: string | undefined) => (message ?? "").replace(ANSI_RE, "");

export async function GET(req: NextRequest) {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ message: "로그인이 필요합니다" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const target = GROUPS[sp.get("group") ?? "api"];
  if (!target) return NextResponse.json({ message: "잘못된 group" }, { status: 400 });
  const minutes = Math.min(MAX_MINUTES, Math.max(1, Number(sp.get("minutes")) || 60));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get("limit")) || 300));

  // errors 모드 — ERROR(·WARN)만 서버 측 패턴 필터로 걷어온다(에러 모아보기 페이지)
  const mode = sp.get("mode") === "errors" ? "errors" : "tail";
  const withWarn = sp.get("warn") === "1";

  // 개발 전용 스텁 — AWS 없이 화면을 확인한다. 운영 빌드(NODE_ENV=production)에서는 절대 켜지지 않는다
  if (process.env.NODE_ENV !== "production" && process.env.BACKEND_LOGS_STUB === "1") {
    return NextResponse.json({ events: buildStubEvents(sp.get("group") ?? "api", mode, withWarn) });
  }

  try {
    if (mode === "errors") {
      const out = await getClient().send(
        new FilterLogEventsCommand({
          logGroupName: target.group,
          logStreamNames: [target.stream],
          startTime: Date.now() - minutes * 60_000,
          filterPattern: withWarn ? "?ERROR ?FATAL ?WARN" : "?ERROR ?FATAL",
          limit: Math.min(2000, limit * 4),
        }),
      );
      const events = (out.events ?? []).map((e) => ({ t: e.timestamp ?? 0, message: clean(e.message) }));
      return NextResponse.json({ events });
    }

    const out = await getClient().send(
      new GetLogEventsCommand({
        logGroupName: target.group,
        logStreamName: target.stream,
        startTime: Date.now() - minutes * 60_000,
        limit,
        startFromHead: false, // 최신부터 = tail
      }),
    );
    const events = (out.events ?? []).map((e) => ({ t: e.timestamp ?? 0, message: clean(e.message) }));
    return NextResponse.json({ events });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "ResourceNotFoundException")
      return NextResponse.json(
        { message: "로그 그룹이 아직 없습니다 — 백엔드의 awslogs 전환(backend/deploy/aws/README.md \"로그 → CloudWatch\") 이후에 생깁니다" },
        { status: 404 },
      );
    if (name === "AccessDeniedException")
      return NextResponse.json(
        { message: "이 서버의 인스턴스 롤에 CloudWatch 읽기 권한이 없습니다 (logs:GetLogEvents — infra 에 IAM 정책 요청)" },
        { status: 403 },
      );
    return NextResponse.json(
      { message: "로그 조회 실패: " + (error instanceof Error ? error.message : "unknown") },
      { status: 502 },
    );
  }
}

/** 스텁 이벤트 — 실제 NestJS·Caddy 로그와 비슷한 모양(전부 가짜 문장)으로 화면 확인용 */
function buildStubEvents(group: string, mode: "tail" | "errors", withWarn: boolean) {
  const now = Date.now();
  const api = [
    '[Nest] 42  - LOG [DripBatchOrchestrator] drip batch finished { runDate: "2026-09-02", targetCount: 3, successCount: 3 }',
    '[Nest] 42  - WARN [AllExceptionsFilter] request failed { path: "/api/v1/auth/social-login", errorCode: "AUTH_INVALID_PROVIDER_TOKEN" }',
    // 요청 완료 라인 — LoggingInterceptor 실제 형식(요청 통계 탭이 이 형태를 파싱한다)
    "[Nest] 42  - LOG [LoggingInterceptor] Object(5) { trace_id: '01H8X', method: 'GET', path: '/api/v1/users/me/library-items', status: 200, duration_ms: 34 }",
    "[Nest] 42  - LOG [LoggingInterceptor] Object(5) { trace_id: '01H8Y', method: 'POST', path: '/api/v1/contents/3f9c1a2b-0000-4000-8000-000000000001/play', status: 201, duration_ms: 88 }",
    "[Nest] 42  - LOG [LoggingInterceptor] Object(5) { trace_id: '01H8Z', method: 'GET', path: '/api/v1/explore', status: 200, duration_ms: 152 }",
    "[Nest] 42  - LOG [LoggingInterceptor] Object(5) { trace_id: '01H90', method: 'POST', path: '/api/v1/auth/social-login', status: 401, duration_ms: 21 }",
    '[Nest] 42  - ERROR [ExternalServiceException] store receipt verification timeout { target: "app-store", retryCount: 2 }',
    '[Nest] 42  - ERROR [TypeORMError] connection terminated unexpectedly { retryCount: 1 }',
  ];
  const caddy = [
    '203.0.113.7 - GET /api/v1/health 200 1ms',
    '198.51.100.3 - POST /api/v1/contents/3f9c/play 403 12ms',
  ];
  let lines = group === "caddy" ? caddy : api;
  if (mode === "errors") {
    lines = lines.filter((l) => /ERROR/.test(l) || (withWarn && /WARN/.test(l)));
  }
  return Array.from({ length: mode === "errors" ? 23 : 40 }, (_, i) => ({
    t: now - (40 - i) * 30_000,
    message: lines.length ? lines[i % lines.length] : "",
  })).filter((e) => e.message);
}
