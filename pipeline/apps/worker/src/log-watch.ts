import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { log } from "./util.js";
import { holdLease, leaseValue, setLeaseValue } from "./lease.js";
import { clampCursor, formatGap, scanWindow, type LogPage } from "./log-watch-scan.js";
import { pipelineLocale } from "@ear/pipeline";

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
 * - 틱마다 창 `(읽은 위치, 지금 − 1분]` 을 `nextToken` 끝까지 읽는다(log-watch-scan.ts — 첫 페이지만 읽다 일주일 넘게 멈춘 사고, 2026-11-20)
 * - 읽은 위치가 1시간보다 뒤처지면(재시작·넘겨받기·장애) 그 구간은 건너뛰고 Slack 에 한 줄로 알린다 — 과거분 재알림 방지
 *   (놓친 창은 어드민 웹 에러 모아보기에서)
 *
 * **복제 (2026-10-30)**: 한국판 워커를 복제로 돌리면 읽은 위치(cursorTs)가 프로세스마다 따로라 같은 오류가 복제 수만큼 올라간다 —
 * 임대(lease.ts "log-watch")를 쥔 복제 하나만 읽고, 읽은 위치는 임대 줄에 남겨 넘겨받은 복제가 이어 읽는다(최대 1시간 전부터).
 *
 * **생존 신호**: 읽은 위치가 앞으로 간 틱마다 `ear/ops` 의 `CronSuccess{Job=log-watch}` 에 1을 찍는다. 이 감시자가 죽으면
 * 백엔드가 500 을 뿜어도 Slack 이 조용해지는데, **그 조용함이 "정상"과 구분되지 않는다.** 작업 큐의
 * `jobs.heartbeat_at` 은 작업을 집었을 때만 찍혀 "살아있지만 놀고 있음"을 나타내지 못하므로 쓸 수 없다.
 * 백업·스냅샷 크론과 같은 방식이고, 알람이 "일정 시간 지표 없음"을 잡는다(2026-09-20). 종전에는 조회 호출이 성공하면
 * 찍어서, 같은 자리를 맴돌던 일주일 넘게 살아 있는 것으로 보였다(2026-11-20).
 */
const WEBHOOK_URL = process.env.SLACK_ERROR_WEBHOOK_URL || "";
const INTERVAL_MS = Number(process.env.LOG_WATCH_INTERVAL_MS || 5 * 60_000);
const LOG_GROUP = process.env.BACKEND_LOG_GROUP_API || "/ear/api";
const LOG_STREAM = "api";
const MAX_EVENTS_PER_TICK = 500;
/** 한 틱의 페이지 상한 — 한 장에 오류가 20건 안팎이라(11-20 실측 18건) 500건 상한까지 읽을 수 있게. 넘기면 남은 것은 다음 틱이 잇는다 */
const MAX_PAGES_PER_TICK = 30;
/** 창 끝을 지금보다 이만큼 앞에 둔다 — 막 쓰인 로그가 CloudWatch 에 늦게 닿아도 창 안에 들어오게 */
const INGEST_LAG_MS = 60_000;
const MAX_GROUPS_PER_MESSAGE = 8;
const SAMPLE_MAX_CHARS = 180;
const ADMIN_ERRORS_URL = `https://${process.env.PIPELINE_DOMAIN || "admin.earcast.co.kr"}/backend-logs/errors`;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;

let client: CloudWatchLogsClient | undefined;
let metrics: CloudWatchClient | undefined;
let cursorTs = Date.now();
let leader = false;
/** 읽은 위치가 이보다 뒤처지면 그 구간은 건너뛴다 — 넘겨받기·재시작·장애 모두 같은 상한 */
const MAX_BACK_MS = 60 * 60_000;

/** 워커 기동 시 1회 호출 — 켜졌는지 여부만 돌려준다 */
export function startLogWatch(): "on" | "off" {
  if (!WEBHOOK_URL) return "off";
  // 백엔드 로그 감시는 한국판 서버 워커 하나만 — 글로벌판 워커가 같은 웹훅을 받아도 같은 오류를 두 번 올리지 않는다(KAN-208)
  if (pipelineLocale() === "en") return "off";

  const timer = setInterval(() => void tick(), INTERVAL_MS);
  timer.unref(); // 이 타이머가 프로세스 종료(--once·--drain)를 붙잡지 않는다

  return "on";
}

async function tick(): Promise<void> {
  try {
    // 복제 중 하나만 — 대기 복제는 건너뛴다. 넘겨받는 순간 앞 주인이 남긴 읽은 위치에서 잇는다(없으면 이 프로세스의 시작 시점)
    if (!(await holdLease("log-watch", INTERVAL_MS * 3))) { leader = false; return; }
    if (!leader) {
      leader = true;
      const saved = Number(await leaseValue<number>("log-watch", "cursor")) || 0;
      if (saved) cursorTs = saved; // 너무 오래됐으면 아래 clampCursor 가 당기고 Slack 에 알린다
      log(`백엔드 ERROR 감시 — 이 복제가 맡음 (읽은 위치 ${isoMinute(cursorTs)})`);
    }

    const windowEnd = Date.now() - INGEST_LAG_MS;
    const { cursor: from, skippedMs } = clampCursor(cursorTs, windowEnd, MAX_BACK_MS);
    if (skippedMs > 0) log(`백엔드 ERROR 감시 — 읽은 위치가 ${formatGap(skippedMs)} 밀려 그 구간을 건너뜀`);

    const scan = await scanWindow(fetchPage, from, windowEnd, { maxEvents: MAX_EVENTS_PER_TICK, maxPages: MAX_PAGES_PER_TICK });
    cursorTs = scan.cursor;
    await setLeaseValue("log-watch", "cursor", cursorTs); // 다른 복제가 넘겨받을 때 이어 읽는 위치

    // "조회 호출이 성공했다"가 아니라 "읽은 위치가 앞으로 갔다"가 신호다 — 같은 자리를 맴도는 감시는 알람이 잡아야 한다
    if (scan.cursor > from) await putAlive();
    else log(`백엔드 ERROR 감시 — 페이지 ${MAX_PAGES_PER_TICK}장 안에 진척 없음 (읽은 위치 ${isoMinute(cursorTs)})`);

    const events = scan.events
      .map((e) => ({ t: e.t, message: e.message.replace(ANSI_RE, "").trim() }))
      .filter((e) => e.message);
    if (events.length === 0 && skippedMs === 0) return;

    const groups = new Map<string, { count: number; sample: string }>();
    for (const e of events) {
      const sig = signatureOf(e.message);
      const g = groups.get(sig);
      if (g) g.count += 1;
      else groups.set(sig, { count: 1, sample: e.message });
    }

    await postToSlack(events.length, [...groups.values()], skippedMs);
    log(`백엔드 ERROR ${events.length}건 → Slack 알림 (유형 ${groups.size}개)`);
  } catch (e) {
    // 감시 실패는 작업 처리와 무관 — 조용히 다음 틱을 기다린다
    log(`백엔드 로그 감시 실패 (다음 틱에 재시도): ${e instanceof Error ? e.message : e}`);
  }
}

/** CloudWatch 한 페이지 — `scanWindow` 가 `nextToken` 이 없을 때까지 부른다 */
async function fetchPage(startTime: number, endTime: number, nextToken?: string): Promise<LogPage> {
  client ??= new CloudWatchLogsClient({ region: process.env.AWS_REGION || "ap-northeast-2" });
  const out = await client.send(
    new FilterLogEventsCommand({
      logGroupName: LOG_GROUP,
      logStreamNames: [LOG_STREAM],
      startTime,
      endTime,
      nextToken,
      filterPattern: "?ERROR ?FATAL",
      limit: MAX_EVENTS_PER_TICK,
    }),
  );
  return {
    events: (out.events ?? []).map((e) => ({ t: e.timestamp ?? 0, message: e.message ?? "" })),
    nextToken: out.nextToken,
  };
}

const isoMinute = (t: number) => new Date(t).toISOString().slice(0, 16);

/**
 * 생존 신호 한 점. **실패해도 감시를 멈추지 않는다** — 지표를 못 찍는 것은 알람의 문제이지
 * ERROR 알림의 문제가 아니다. 대신 로그로 남겨 권한·네트워크 문제를 사람이 볼 수 있게 한다.
 */
async function putAlive(): Promise<void> {
  try {
    metrics ??= new CloudWatchClient({ region: process.env.AWS_REGION || "ap-northeast-2" });
    await metrics.send(
      new PutMetricDataCommand({
        Namespace: "ear/ops",
        MetricData: [{ MetricName: "CronSuccess", Dimensions: [{ Name: "Job", Value: "log-watch" }], Value: 1, Unit: "Count" }],
      }),
    );
  } catch (e) {
    log(`로그 감시 생존 신호 기록 실패(알람이 오탐할 수 있다): ${e instanceof Error ? e.message : e}`);
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

async function postToSlack(total: number, groups: { count: number; sample: string }[], skippedMs: number): Promise<void> {
  const top = groups.sort((a, b) => b.count - a.count).slice(0, MAX_GROUPS_PER_MESSAGE);
  const lines = top.map((g) => `• [${g.count}건] ${g.sample.slice(0, SAMPLE_MAX_CHARS)}`);
  if (groups.length > top.length) lines.push(`… 외 ${groups.length - top.length}개 유형`);

  const head = total > 0 ? [`:rotating_light: *백엔드 ERROR ${total}건* (api 로그)`] : [];
  // 건너뛴 구간은 알리지 않은 것이지 오류가 없던 것이 아니다 — 조용함으로 보이지 않게 한 줄 남긴다
  const skipped = skippedMs > 0 ? [`:warning: 감시가 ${formatGap(skippedMs)} 밀려 그 구간의 오류는 알리지 않았다 — 에러 모아보기에서 확인`] : [];
  const text = [...head, ...lines, ...skipped, `자세히: ${ADMIN_ERRORS_URL}`].join("\n");

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Slack webhook ${res.status}`);
}
