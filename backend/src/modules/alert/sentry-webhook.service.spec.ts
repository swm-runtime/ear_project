import { createHmac } from 'node:crypto';

import { SentryIssueClient } from './sentry-issue.client';
import { SentryWebhookService } from './sentry-webhook.service';
import { SlackAlertService } from './slack-alert.service';

function build(
  token: string | undefined,
  slackEnabled = true,
  secret: string | undefined = undefined,
) {
  const notify = jest.fn();
  const slack = {
    enabled: slackEnabled,
    notify,
  } as unknown as SlackAlertService;
  const config = {
    get: jest.fn((key: string) =>
      key === 'SENTRY_WEBHOOK_TOKEN'
        ? token
        : key === 'SENTRY_WEBHOOK_SECRET'
          ? secret
          : undefined,
    ),
  } as never;
  const issueClient = {
    enabled: false,
    fetch: jest.fn().mockResolvedValue(null),
  } as unknown as SentryIssueClient;
  return {
    service: new SentryWebhookService(config, slack, issueClient),
    notify,
    issueClient,
  };
}

const SECRET = 'client-secret-0123456789abcdef';
const sign = (body: Buffer, secret = SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');

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

  describe('서명 검증(Sentry-Hook-Signature — Client Secret, 2026-10-07)', () => {
    const body = Buffer.from(
      '{"action":"triggered","data":{"event":{"title":"boom"}}}',
    );

    it('받은 본문 그대로의 HMAC-SHA256 과 같으면 통과한다 — 대소문자·앞뒤 공백은 가리지 않는다', () => {
      const { service } = build(undefined, true, SECRET);

      expect(service.isValidSignature(body, sign(body))).toBe(true);
      expect(
        service.isValidSignature(body, ` ${sign(body).toUpperCase()} `),
      ).toBe(true);
    });

    it('다른 비밀로 만든 서명·바뀐 본문·헤더 없음은 거짓이다', () => {
      const { service } = build(undefined, true, SECRET);

      expect(service.isValidSignature(body, sign(body, 'other-secret'))).toBe(
        false,
      );
      expect(
        service.isValidSignature(Buffer.from('{"changed":1}'), sign(body)),
      ).toBe(false);
      expect(service.isValidSignature(body, undefined)).toBe(false);
      expect(service.isValidSignature(undefined, sign(body))).toBe(false);
    });

    it('비밀이 없으면 서명 방식은 꺼진 것 — 어떤 서명도 통과하지 않는다', () => {
      const { service } = build(TOKEN);

      expect(service.isValidSignature(body, sign(body))).toBe(false);
      expect(service.isValidSignature(body, sign(body, ''))).toBe(false);
    });

    it('비밀만 있어도 켜진 것이고, 토큰 방식은 꺼져 있다', () => {
      const { service } = build(undefined, true, SECRET);

      expect(service.enabled).toBe(true);
      expect(service.isValidToken(TOKEN)).toBe(false);
    });
  });

  it('본문을 문구로 바꿔 Slack 에 넘긴다 — kind 는 sentry-issue', async () => {
    const { service, notify } = build(TOKEN);

    service.relay({ project_slug: 'ear-api', level: 'error', message: 'boom' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(notify).toHaveBeenCalledTimes(1);
    const [kind, text] = notify.mock.calls[0] as [string, string];
    expect(kind).toBe('sentry-issue');
    expect(text).toContain('*ear-api*');
    expect(text).toContain('boom');
  });

  it('issue id 가 있으면 Issue API 를 물어 State · First Seen 줄을 붙이고, 조회가 null 이면 그 줄 없이 보낸다', async () => {
    const { service, notify, issueClient } = build(TOKEN);
    (issueClient.fetch as jest.Mock).mockResolvedValueOnce({
      shortId: 'EAR-API-7',
      state: 'new',
      firstSeen: new Date(Date.now() - 90_000),
      lastSeen: null,
      count: 2,
      userCount: null,
    });

    service.relay({
      id: '77',
      project_slug: 'ear-api',
      level: 'error',
      message: 'boom',
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(issueClient.fetch).toHaveBeenCalledWith('77');
    expect((notify.mock.calls[0] as [string, string])[1]).toContain(
      'State: New · First Seen: 2분 전 · 2건 · EAR-API-7',
    );

    service.relay({
      id: '78',
      project_slug: 'ear-api',
      level: 'error',
      message: 'again',
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect((notify.mock.calls[1] as [string, string])[1]).not.toContain(
      'State:',
    );
  });

  it('제목이 없는 본문(테스트 이벤트 등)은 조용히 버린다 — 던지지 않는다', () => {
    const { service, notify } = build(TOKEN);

    expect(() => service.relay({})).not.toThrow();
    expect(() => service.relay(undefined)).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });
});
