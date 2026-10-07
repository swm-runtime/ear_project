import { escapeSlackText } from './slack-alert.service';

/**
 * Sentry 웹훅 → Slack 문구 — **순수 함수만 둔다.**
 *
 * 2026-10-07 Sentry Business 체험이 끝나 무료 플랜이 되면서 Sentry → Slack 공식 연동이 2026-10-14 에 멈춘다.
 * 서버 ERROR 는 `log-watch` 가 Slack 으로 보내지만 **앱(ear-app) 크래시는 Sentry 가 유일한 경로**라, 플랜 제한이
 * 없는 웹훅을 서버로 받아 `SlackAlertService` 로 흘린다. 서버 프로젝트(ear-api)도 같은 주소를 걸어
 * 종전 Slack 규칙 둘을 대체한다(`backend-monitoring.md` 3-2 · `runbook.md` 4-1).
 *
 * 두 가지 모양을 받는다:
 * - **Internal Integration**(Integration Platform, 권장 — 2026-10-07 실측: 레거시 플러그인은 새 알림 빌더에 액션으로
 *   안 뜬다): `{ action: "triggered", data: { event: {…}, triggered_rule }, installation }`. 프로젝트 슬러그는 필드가
 *   없고 `data.event.url`(`/projects/<org>/<slug>/events/…`)에서 꺼낸다. 이슈 링크는 `web_url`.
 * - **레거시 WebHooks 플러그인**: `{ project_slug, level, message, culprit, url, event: {…} }`.
 *
 * 페이로드는 Sentry 가 정한 모양이라 DTO 로 받지 않는다(모르는 필드가 많고 `forbidNonWhitelisted` 에 걸린다).
 * 필요한 몇 필드만 방어적으로 꺼내고, 하나도 못 꺼내면 `null` — 그래도 응답은 성공이다(Sentry 재시도를 부르지
 * 않는다). 통합 설치 때 오는 `installation` 웹훅도 제목이 없어 여기서 조용히 버려진다.
 */

/** 문구에 싣는 것만. 사용자 식별값(이메일·user id·IP)은 애초에 꺼내지 않는다 */
export interface SentryIssueNotice {
  project: string;
  level: string;
  title: string;
  environment: string | null;
  release: string | null;
  /** Sentry 이슈 주소 — `sentry.io` 도메인일 때만 링크로 싣는다 */
  url: string | null;
  /** 어디서 — `culprit`(예: `PlayerScreen in render`), 없으면 스택 맨 위 in-app 프레임 */
  location: string | null;
  /** 기기·OS·앱 버전 — `contexts.os/device/app` 와 태그에서. 앱 크래시를 재현할 최소 정보 */
  device: string | null;
  /** 울린 알림 규칙 이름(Integration Platform `triggered_rule` / 레거시 `triggering_rules[0]`) */
  rule: string | null;
  /** 스택 맨 위 in-app 프레임 최대 3줄(`file:line in fn`) — Sentry 알림이 보여 주던 것. 없으면 빈 배열 */
  frames: string[];
}

const TITLE_MAX_LENGTH = 200;
/** 링크로 실을 주소 — Sentry 가 보낸 값이라도 `<주소|글자>` 로 싣기 전에 도메인을 본다(위장 링크 차단) */
const SENTRY_URL_PATTERN = /^https:\/\/([a-z0-9-]+\.)*sentry\.io\//i;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** `event.tags` 는 `[["key","value"], …]` 배열이다 — 그 안에서 하나를 찾는다 */
function tagValue(
  event: Record<string, unknown> | null,
  key: string,
): string | null {
  const tags = event?.tags;
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === key) return asString(tag[1]);
  }
  return null;
}

/** Integration Platform 의 `data.event.url` 에서 프로젝트 슬러그를 꺼낸다 — 다른 필드에는 숫자 id 뿐이다 */
const PROJECT_SLUG_IN_URL = /\/projects\/[^/]+\/([^/]+)\/events\//;

function projectSlugFromUrl(url: string | null): string | null {
  const match = url ? PROJECT_SLUG_IN_URL.exec(url) : null;
  return match ? match[1] : null;
}

const MAX_FRAMES = 3;
const FRAME_MAX_LENGTH = 120;

/**
 * 스택에서 in-app 프레임을 **위(최근)에서부터** 최대 3개 — Sentry 는 프레임을 오래된 것부터 담으므로 뒤집는다.
 * in-app 이 하나도 없으면 전체에서 고른다(네이티브 크래시는 in_app 표시가 없을 수 있다). 경로는 긴 절대 경로가
 * 섞이므로 마지막 두 조각만 남긴다. 사용자 입력은 섞이지 않는 필드지만 그래도 escape 는 호출부가 한다.
 */
function topFrames(event: Record<string, unknown> | null): string[] {
  const values = asRecord(event?.exception)?.values;
  const first = Array.isArray(values) ? asRecord(values[0]) : null;
  const rawFrames = asRecord(first?.stacktrace)?.frames;
  if (!Array.isArray(rawFrames)) return [];

  const frames = rawFrames.map(asRecord).filter((f) => f !== null);
  const inApp = frames.filter((f) => f.in_app === true);
  const picked = (inApp.length > 0 ? inApp : frames)
    .slice(-MAX_FRAMES)
    .reverse();

  return picked.map((f) => {
    const file =
      asString(f.filename) ?? asString(f.abs_path) ?? asString(f.module) ?? '?';
    const shortFile = file.split('/').slice(-2).join('/');
    const line = typeof f.lineno === 'number' ? `:${f.lineno}` : '';
    const fn = asString(f.function);
    const text = `${shortFile}${line}${fn ? ` in ${fn}` : ''}`;
    return [...text].length > FRAME_MAX_LENGTH
      ? `${[...text].slice(0, FRAME_MAX_LENGTH).join('')}…`
      : text;
  });
}

/** `contexts.os`·`contexts.device`·`contexts.app` + 태그에서 "iOS 18.6 · iPhone15,2 · 앱 1.1.0" 같은 한 줄 */
function deviceSummary(event: Record<string, unknown> | null): string | null {
  const contexts = asRecord(event?.contexts);
  const os = asRecord(contexts?.os);
  const device = asRecord(contexts?.device);
  const app = asRecord(contexts?.app);

  const osText =
    [asString(os?.name) ?? tagValue(event, 'os.name'), asString(os?.version)]
      .filter((v): v is string => v !== null)
      .join(' ') || null;
  const deviceText =
    asString(device?.model) ??
    asString(device?.family) ??
    tagValue(event, 'device.family');
  const appVersion =
    asString(app?.app_version) ?? tagValue(event, 'app.version');
  const parts = [
    osText,
    deviceText,
    appVersion ? `앱 ${appVersion}` : null,
  ].filter((v): v is string => v !== null);

  return parts.length > 0 ? parts.join(' · ') : null;
}

/** 본문에서 알림에 필요한 것만 꺼낸다. 제목이 될 값이 하나도 없으면 `null` */
export function parseSentryWebhook(body: unknown): SentryIssueNotice | null {
  const root = asRecord(body);
  if (!root) return null;

  // Integration Platform 이면 본문이 `data` 아래에 있다. 레거시는 루트가 곧 본문이다
  const data = asRecord(root.data);
  const event = asRecord(data?.event) ?? asRecord(root.event);

  const title =
    asString(event?.title) ??
    asString(event?.message) ??
    asString(root.message) ??
    asString(event?.culprit) ??
    asString(root.culprit);
  if (!title) return null;

  const issueUrl =
    asString(event?.web_url) ?? asString(root.url) ?? asString(event?.url);
  const frames = topFrames(event);
  const triggeringRules = root.triggering_rules;

  return {
    project:
      asString(root.project_slug) ??
      asString(root.project_name) ??
      asString(root.project) ??
      projectSlugFromUrl(asString(event?.url)) ??
      'sentry',
    level: (
      asString(event?.level) ??
      asString(root.level) ??
      'error'
    ).toLowerCase(),
    title,
    environment: asString(event?.environment) ?? tagValue(event, 'environment'),
    release: asString(event?.release) ?? tagValue(event, 'release'),
    url: issueUrl && SENTRY_URL_PATTERN.test(issueUrl) ? issueUrl : null,
    location:
      asString(event?.culprit) ??
      asString(root.culprit) ??
      asString(event?.location) ??
      frames[0] ??
      null,
    device: deviceSummary(event),
    rule:
      asString(data?.triggered_rule) ??
      (Array.isArray(triggeringRules) ? asString(triggeringRules[0]) : null),
    frames,
  };
}

/** 제목을 상한에서 자른다 — 넘치면 말줄임표 */
function truncateTitle(title: string): string {
  const chars = [...title];
  return chars.length > TITLE_MAX_LENGTH
    ? `${chars.slice(0, TITLE_MAX_LENGTH).join('')}…`
    : title;
}

const LEVEL_EMOJI: Readonly<Record<string, string>> = {
  fatal: ':red_circle:',
  error: ':rotating_light:',
  warning: ':warning:',
};

/**
 * 머리 한 줄(프로젝트·레벨·env·release) + 제목 + 위치·기기·규칙 + 스택 3줄 + 링크 — Sentry 자체 Slack 알림이
 * 보여 주던 만큼(2026-10-07 운영 실측 뒤 보강). 모든 문자열은 **Sentry 가 보낸 글**이라 `escapeSlackText` 를
 * 거친다 — 예외 메시지에는 사용자가 입력한 문자열이 섞일 수 있다(`<!channel>` 같은 것). 사용자 식별값은
 * 애초에 꺼내지 않았다(`parseSentryWebhook`).
 */
export function formatSentryIssueText(notice: SentryIssueNotice): string {
  const emoji = LEVEL_EMOJI[notice.level] ?? ':information_source:';
  const head = [
    `${emoji} Sentry 이슈 · *${escapeSlackText(notice.project)}* · ${escapeSlackText(notice.level)}`,
  ];
  if (notice.environment)
    head.push(`env ${escapeSlackText(notice.environment)}`);
  if (notice.release) head.push(`release ${escapeSlackText(notice.release)}`);

  const lines = [
    head.join(' · '),
    `*${escapeSlackText(truncateTitle(notice.title))}*`,
  ];
  if (notice.location) lines.push(`위치: ${escapeSlackText(notice.location)}`);
  if (notice.device) lines.push(`기기: ${escapeSlackText(notice.device)}`);
  if (notice.rule) lines.push(`규칙: ${escapeSlackText(notice.rule)}`);
  if (notice.frames.length > 0) {
    lines.push(
      '```' + notice.frames.map((f) => escapeSlackText(f)).join('\n') + '```',
    );
  }
  if (notice.url) lines.push(`<${notice.url}|Sentry에서 열기>`);

  return lines.join('\n');
}
