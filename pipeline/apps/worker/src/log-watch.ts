import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { log } from "./util.js";

/**
 * 백엔드 ERROR 감시 → Slack 알림 (2026-09-04) — **워커 본 기능과 완전히 분리된 부가 모듈이다.**
 *
 * 제품 API 서버의 CloudWatch 로그(`/ear/api` — backend/deploy/aws/README.md "로그 → CloudWatch")를
 * 5분마다 조회해 새 ERROR/FATAL 만 Slack incoming webhook 으로 보낸다.
 *
 * 격리 원칙 — 이 모듈이 어떤 상태여도 작업 큐 처리(index.ts 루프)는 영향받지 않는다:
 * - 자체 setInterval 로 돌고, 타이머는 unref — `--once`·`--drain` 종료를 붙잡지 않는다
 * - 모든 실행이 try/catch 안 — CloudWatch·Slack 장애는 로그 한 줄로 끝난다
 * - `SLACK_ERROR_WEBHOOK_URL` 이 없으면(노트북 워커) 타이머 자체를 만들지 않는다 — 서버 env.prod 에만 넣는다
 * - 자격은 AI 서버 인스턴스 롤(logs:FilterLogEvents — ear-logs-read 정책). 키를 env 에 두지 않는다
 * - 같은 유형(가변값을 지운 시그니처)은 틱당 한 줄로 묶는다 — 에러 폭풍이 Slack 도배가 되지 않게
 * - 재시작 시 시작 시점 이후만 본다 — 과거분 재알림 방지 (놓친 창은 어드민 웹 에러 모아보기에서)
 */
const WEBHOOK_URL = process.env.SLACK_ERROR_WEBHOOK_URL || "";
const INTERVAL_MS = Number(process.env.LOG_WATCH_INTERVAL_MS || 5 * 60_000);
const LOG_GROUP = process.env.BACKEND_LOG_GROUP_API || "/ear/api";
const LOG_STREAM = "api";
const MAX_EVENTS_PER_TICK = 500;
const MAX_GROUPS_PER_MESSAGE = 8;
const SAMPLE_MAX_CHARS = 180;
const ADMIN_ERRORS_URL = `https://${process.env.PIPELINE_DOMAIN || "admin.earcast.co.kr"}/backend-logs/errors`;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;

let client: CloudWatchLogsClient | undefined;
let cursorTs = Date.now();

/** 워커 기동 시 1회 호출 — 켜졌는지 여부만 돌려준다 */
export function startLogWatch(): "on" | "off" {
  if (!WEBHOOK_URL) return "off";

  const timer = setInterval(() => void tick(), INTERVAL_MS);
  timer.unref(); // 이 타이머가 프로세스 종료(--once·--drain)를 붙잡지 않는다

  return "on";
}

async function tick(): Promise<void> {
  try {
    client ??= new CloudWatchLogsClient({ region: process.env.AWS_REGION || "ap-northeast-2" });
    const out = await client.send(
      new FilterLogEventsCommand({
        logGroupName: LOG_GROUP,
        logStreamNames: [LOG_STREAM],
        startTime: cursorTs + 1,
        filterPattern: "?ERROR ?FATAL",
        limit: MAX_EVENTS_PER_TICK,
      }),
    );

    const events = (out.events ?? [])
      .map((e) => ({ t: e.timestamp ?? 0, message: (e.message ?? "").replace(ANSI_RE, "").trim() }))
      .filter((e) => e.message);
    if (events.length === 0) return;

    cursorTs = Math.max(...events.map((e) => e.t)); // limit 초과분은 다음 틱이 이어받는다

    const groups = new Map<string, { count: number; sample: string }>();
    for (const e of events) {
      const sig = signatureOf(e.message);
      const g = groups.get(sig);
      if (g) g.count += 1;
      else groups.set(sig, { count: 1, sample: e.message });
    }

    await postToSlack(events.length, [...groups.values()]);
    log(`백엔드 ERROR ${events.length}건 → Slack 알림 (유형 ${groups.size}개)`);
  } catch (e) {
    // 감시 실패는 작업 처리와 무관 — 조용히 다음 틱을 기다린다
    log(`백엔드 로그 감시 실패 (다음 틱에 재시도): ${e instanceof Error ? e.message : e}`);
  }
}

/** 어드민 웹 에러 모아보기와 같은 근사 — 가변값(uuid·해시·숫자)을 지워 같은 유형을 접는다 */
function signatureOf(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hash>")
    .replace(/"[^"]{0,120}"/g, '"…"')
    .replace(/\b\d+(\.\d+)?(ms|s|%)?\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

async function postToSlack(total: number, groups: { count: number; sample: string }[]): Promise<void> {
  const top = groups.sort((a, b) => b.count - a.count).slice(0, MAX_GROUPS_PER_MESSAGE);
  const lines = top.map((g) => `• [${g.count}건] ${g.sample.slice(0, SAMPLE_MAX_CHARS)}`);
  if (groups.length > top.length) lines.push(`… 외 ${groups.length - top.length}개 유형`);

  const text = [`:rotating_light: *백엔드 ERROR ${total}건* (api 로그)`, ...lines, `자세히: ${ADMIN_ERRORS_URL}`].join("\n");

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Slack webhook ${res.status}`);
}
