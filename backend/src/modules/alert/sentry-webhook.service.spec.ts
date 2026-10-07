import { SentryWebhookService } from './sentry-webhook.service';
import { SlackAlertService } from './slack-alert.service';

function build(token: string | undefined, slackEnabled = true) {
  const notify = jest.fn();
  const slack = {
    enabled: slackEnabled,
    notify,
  } as unknown as SlackAlertService;
  const config = {
    get: jest.fn((key: string) =>
      key === 'SENTRY_WEBHOOK_TOKEN' ? token : undefined,
    ),
  } as never;
  return { service: new SentryWebhookService(config, slack), notify };
}

const TOKEN = 'abcdefghijklmnop0123456789';

describe('SentryWebhookService', () => {
  it('토큰이 같을 때만 통과 — 길이가 달라도, 한 글자만 달라도 거짓', () => {
    const { service } = build(TOKEN);

    expect(service.isValidToken(TOKEN)).toBe(true);
    expect(service.isValidToken(`${TOKEN}x`)).toBe(false);
    expect(service.isValidToken(TOKEN.replace('a', 'b'))).toBe(false);
    expect(service.isValidToken('')).toBe(false);
  });

  it('토큰이 비어 있으면 꺼진 것 — 빈 문자열을 보내도 통과하지 않는다', () => {
    const { service } = build(undefined);

    expect(service.enabled).toBe(false);
    expect(service.isValidToken('')).toBe(false);
  });

  it('공백만 있는 토큰도 비어 있는 것으로 본다', () => {
    const { service } = build('   ');

    expect(service.enabled).toBe(false);
    expect(service.isValidToken('   ')).toBe(false);
  });

  it('Slack 웹훅이 없으면 enabled 가 아니다 — 기동 요약이 그 상태를 찍는다', () => {
    expect(build(TOKEN, false).service.enabled).toBe(false);
    expect(build(TOKEN, true).service.enabled).toBe(true);
  });

  it('본문을 문구로 바꿔 Slack 에 넘긴다 — kind 는 sentry-issue', () => {
    const { service, notify } = build(TOKEN);

    service.relay({ project_slug: 'ear-api', level: 'error', message: 'boom' });

    expect(notify).toHaveBeenCalledTimes(1);
    const [kind, text] = notify.mock.calls[0] as [string, string];
    expect(kind).toBe('sentry-issue');
    expect(text).toContain('*ear-api*');
    expect(text).toContain('boom');
  });

  it('제목이 없는 본문(테스트 이벤트 등)은 조용히 버린다 — 던지지 않는다', () => {
    const { service, notify } = build(TOKEN);

    expect(() => service.relay({})).not.toThrow();
    expect(() => service.relay(undefined)).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });
});
