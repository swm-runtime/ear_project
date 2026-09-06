import { NextResponse } from "next/server";
import {
  CloudWatchLogsClient,
  DescribeLogStreamsCommand,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { currentUser } from "@/lib/supabase-server";

/**
 * 백엔드 서버 상태 요약 — 서버 상태 탭의 데이터 원천 (Supabase 로그인 필수).
 * ① API health 핑(응답·지연) ② 로그 파이프 생존(그룹별 마지막 이벤트 시각)
 * ③ 최근 1시간 ERROR 수. 전부 읽기 전용이라 부작용이 없다.
 */
const EAR_BASE = () => (process.env.EAR_API_BASE_URL ?? "https://api.earcast.co.kr/api/v1").replace(/\/$/, "");
const GROUPS: Record<string, string> = {
  api: process.env.BACKEND_LOG_GROUP_API ?? "/ear/api",
  caddy: process.env.BACKEND_LOG_GROUP_CADDY ?? "/ear/caddy",
};
const HEALTH_TIMEOUT_MS = 4000;
const ERROR_COUNT_CAP = 500;

let client: CloudWatchLogsClient | undefined;
const getClient = () =>
  (client ??= new CloudWatchLogsClient({ region: process.env.AWS_REGION || "ap-northeast-2" }));

type Health = { ok: boolean; status?: number; latencyMs?: number; error?: string };

export async function GET() {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ message: "로그인이 필요합니다" }, { status: 401 });

  // 개발 전용 스텁 — 운영 빌드에서는 절대 켜지지 않는다
  if (process.env.NODE_ENV !== "production" && process.env.BACKEND_LOGS_STUB === "1") {
    const now = Date.now();
    return NextResponse.json({
      health: { ok: true, status: 200, latencyMs: 87 },
      pipes: { api: now - 12_000, caddy: now - 45_000 },
      errors1h: 3,
      errorsCapped: false,
    });
  }

  const [health, apiLast, caddyLast, errors1h] = await Promise.all([
    pingHealth(),
    lastEventAt(GROUPS.api, "api"),
    lastEventAt(GROUPS.caddy, "caddy"),
    countRecentErrors(GROUPS.api, "api"),
  ]);

  return NextResponse.json({
    health,
    pipes: { api: apiLast, caddy: caddyLast },
    errors1h: errors1h === null ? null : Math.min(errors1h, ERROR_COUNT_CAP),
    errorsCapped: errors1h !== null && errors1h >= ERROR_COUNT_CAP,
  });
}

async function pingHealth(): Promise<Health> {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${EAR_BASE()}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : "unknown" };
  }
}

/** 로그 파이프 생존 — awslogs 스트림의 마지막 이벤트 시각. 그룹이 없으면 null(전환 전) */
async function lastEventAt(group: string, stream: string): Promise<number | null> {
  try {
    const out = await getClient().send(
      new DescribeLogStreamsCommand({ logGroupName: group, logStreamNamePrefix: stream, limit: 1 }),
    );
    return out.logStreams?.[0]?.lastEventTimestamp ?? null;
  } catch {
    return null;
  }
}

async function countRecentErrors(group: string, stream: string): Promise<number | null> {
  try {
    const out = await getClient().send(
      new FilterLogEventsCommand({
        logGroupName: group,
        logStreamNames: [stream],
        startTime: Date.now() - 60 * 60_000,
        filterPattern: "?ERROR ?FATAL",
        limit: ERROR_COUNT_CAP,
      }),
    );
    return (out.events ?? []).length;
  } catch {
    return null;
  }
}
