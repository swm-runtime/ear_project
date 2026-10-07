import {
  formatIssueExtraLine,
  formatSentryIssueText,
  parseSentryWebhook,
} from './sentry-webhook.format';

/** Sentry 레거시 WebHooks 플러그인 페이로드 모양(필요한 필드만) */
const LEGACY_PAYLOAD = {
  id: '6253',
  project: 'ear-app',
  project_name: 'ear-app',
  project_slug: 'ear-app',
  logger: null,
  level: 'error',
  culprit: 'PlayerScreen in render',
  message: 'TypeError: Cannot read property "duration" of undefined',
  url: 'https://sentry.io/organizations/ear/issues/6253/',
  triggering_rules: ['Send a notification for high priority issues'],
  event: {
    event_id: 'abc',
    title: 'TypeError: Cannot read property "duration" of undefined',
    environment: 'production',
    platform: 'javascript',
    release: 'ear-app@1.2.0',
    tags: [
      ['level', 'error'],
      ['os.name', 'iOS'],
    ],
    user: { id: 'should-not-be-read', email: 'no@example.com' },
  },
};

describe('parseSentryWebhook', () => {
  it('레거시 페이로드에서 프로젝트·레벨·제목·환경·릴리스·주소를 꺼낸다 — 사용자 필드는 꺼내지 않는다', () => {
    const notice = parseSentryWebhook(LEGACY_PAYLOAD);

    expect(notice).toEqual({
      project: 'ear-app',
      level: 'error',
      title: 'TypeError: Cannot read property "duration" of undefined',
      environment: 'production',
      release: 'ear-app@1.2.0',
      url: 'https://sentry.io/organizations/ear/issues/6253/',
      location: 'PlayerScreen in render',
      device: 'iOS',
      rule: 'Send a notification for high priority issues',
      frames: [],
      issueId: '6253',
    });
    expect(JSON.stringify(notice)).not.toContain('example.com');
  });

  it('event.title 이 없으면 message, 그것도 없으면 culprit 을 제목으로 쓴다', () => {
    const { event, ...withoutEvent } = LEGACY_PAYLOAD;
    void event;
    expect(parseSentryWebhook(withoutEvent)?.title).toBe(
      LEGACY_PAYLOAD.message,
    );
    expect(parseSentryWebhook({ ...withoutEvent, message: '' })?.title).toBe(
      'PlayerScreen in render',
    );
  });

  it('환경·릴리스는 event 에 없으면 tags 에서 찾는다', () => {
    const notice = parseSentryWebhook({
      ...LEGACY_PAYLOAD,
      event: {
        title: 't',
        tags: [
          ['environment', 'development'],
          ['release', '1.0.0'],
        ],
      },
    });

    expect(notice?.environment).toBe('development');
    expect(notice?.release).toBe('1.0.0');
  });

  it('sentry.io 가 아닌 주소는 링크로 싣지 않는다 — 위장 링크 차단', () => {
    expect(
      parseSentryWebhook({ ...LEGACY_PAYLOAD, url: 'https://evil.example/x' })
        ?.url,
    ).toBeNull();
    expect(
      parseSentryWebhook({
        ...LEGACY_PAYLOAD,
        url: 'https://ear.sentry.io/issues/1/',
      })?.url,
    ).toBe('https://ear.sentry.io/issues/1/');
  });

  it('제목이 될 값이 하나도 없거나 객체가 아니면 null — 테스트 이벤트·빈 본문', () => {
    expect(parseSentryWebhook({})).toBeNull();
    expect(parseSentryWebhook(null)).toBeNull();
    expect(parseSentryWebhook('text')).toBeNull();
    expect(parseSentryWebhook([1, 2])).toBeNull();
  });
});

describe('parseSentryWebhook — Internal Integration(Integration Platform) 모양', () => {
  const PLATFORM_PAYLOAD = {
    action: 'triggered',
    actor: { id: 'sentry', name: 'Sentry', type: 'application' },
    data: {
      event: {
        event_id: 'e1',
        title: 'Error: audio url expired',
        culprit: 'issueAudioUrl',
        environment: 'production',
        level: 'warning',
        platform: 'node',
        project: 4512133,
        release: 'ear-api@1.2.0',
        tags: [['server_name', 'ear-prod-api-1']],
        url: 'https://sentry.io/api/0/projects/runtime-gw/ear-api/events/e1/',
        web_url:
          'https://sentry.io/organizations/runtime-gw/issues/999/events/e1/',
        issue_url:
          'https://sentry.io/api/0/organizations/runtime-gw/issues/999/',
        user: { id: 'no', ip_address: '1.2.3.4' },
      },
      triggered_rule: 'Send a notification for high priority issues',
    },
    installation: { uuid: 'abc' },
  };

  it('data.event 에서 꺼내고, 프로젝트 슬러그는 event.url 경로에서, 링크는 web_url 로', () => {
    expect(parseSentryWebhook(PLATFORM_PAYLOAD)).toEqual(
      expect.objectContaining({
        project: 'ear-api',
        level: 'warning',
        title: 'Error: audio url expired',
        environment: 'production',
        release: 'ear-api@1.2.0',
        url: 'https://sentry.io/organizations/runtime-gw/issues/999/events/e1/',
      }),
    );
  });

  it('통합 설치 웹훅(installation)은 제목이 없어 null — 조용히 버려진다', () => {
    expect(
      parseSentryWebhook({
        action: 'created',
        data: { installation: { uuid: 'abc', status: 'pending' } },
        installation: { uuid: 'abc' },
      }),
    ).toBeNull();
  });
});

describe('formatSentryIssueText', () => {
  it('머리줄 + 제목 + 위치·기기·규칙 + 링크 — Sentry 자체 알림이 보여 주던 만큼', () => {
    const text = formatSentryIssueText(parseSentryWebhook(LEGACY_PAYLOAD)!);

    expect(text).toBe(
      [
        ':rotating_light: Sentry 이슈 · *ear-app* · error · env production · release ear-app@1.2.0',
        '*TypeError: Cannot read property "duration" of undefined*',
        '위치: PlayerScreen in render',
        '기기: iOS',
        '규칙: Send a notification for high priority issues',
        '<https://sentry.io/organizations/ear/issues/6253/|Sentry에서 열기>',
      ].join('\n'),
    );
  });

  it('스택이 있으면 in-app 프레임을 위에서부터 최대 3줄 코드 블록으로, 위치가 없으면 첫 프레임이 위치다', () => {
    const notice = parseSentryWebhook({
      project_slug: 'ear-app',
      level: 'error',
      event: {
        title: 'TypeError: boom',
        contexts: {
          os: { name: 'iOS', version: '18.6' },
          device: { model: 'iPhone15,2' },
          app: { app_version: '1.1.0' },
        },
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: 'node_modules/react/index.js',
                    lineno: 1,
                    function: 'render',
                    in_app: false,
                  },
                  {
                    filename:
                      '/Users/x/app/src/features/player/PlayerScreen.tsx',
                    lineno: 10,
                    function: 'a',
                    in_app: true,
                  },
                  {
                    filename: 'src/features/player/usePlayer.ts',
                    lineno: 20,
                    function: 'b',
                    in_app: true,
                  },
                  {
                    filename: 'src/features/player/useQueue.ts',
                    lineno: 30,
                    function: 'c',
                    in_app: true,
                  },
                  {
                    filename: 'src/shared/lib/time.ts',
                    lineno: 40,
                    function: 'd',
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      },
    })!;

    expect(notice.frames).toEqual([
      'lib/time.ts:40 in d',
      'player/useQueue.ts:30 in c',
      'player/usePlayer.ts:20 in b',
    ]);
    expect(notice.location).toBe('lib/time.ts:40 in d');
    expect(notice.device).toBe('iOS 18.6 · iPhone15,2 · 앱 1.1.0');
    expect(formatSentryIssueText(notice)).toContain(
      '```lib/time.ts:40 in d\nplayer/useQueue.ts:30 in c\nplayer/usePlayer.ts:20 in b```',
    );
  });

  it('Sentry 가 보낸 글의 Slack 제어 문자를 무력화한다 — 예외 메시지에 사용자 입력이 섞일 수 있다', () => {
    const text = formatSentryIssueText({
      project: 'ear-api',
      level: 'fatal',
      title: 'Error: <!channel> payload <https://evil|click>',
      environment: null,
      release: null,
      url: null,
      location: '<!here> in render',
      device: null,
      rule: null,
      frames: [],
      issueId: null,
    });

    expect(text).toBe(
      ':red_circle: Sentry 이슈 · *ear-api* · fatal\n*Error: &lt;!channel&gt; payload &lt;https://evil|click&gt;*\n위치: &lt;!here&gt; in render',
    );
    expect(text).not.toContain('<!channel>');
  });

  it('제목은 200자에서 자른다', () => {
    const text = formatSentryIssueText({
      project: 'p',
      level: 'warning',
      title: 'x'.repeat(250),
      environment: null,
      release: null,
      url: null,
      location: null,
      device: null,
      rule: null,
      frames: [],
      issueId: null,
    });

    expect(text).toContain(`${'x'.repeat(200)}…`);
    expect(text).not.toContain('x'.repeat(201));
    expect(text.startsWith(':warning:')).toBe(true);
  });
});

describe('formatIssueExtraLine — Issue API 값으로 State · First Seen · 건수 줄', () => {
  const now = new Date('2026-10-07T09:00:00Z');

  it('있는 값만 · 로 잇고, 시각은 상대 표기', () => {
    expect(
      formatIssueExtraLine(
        {
          shortId: 'EAR-API-1A',
          state: 'new',
          firstSeen: new Date('2026-10-07T08:58:50Z'),
          lastSeen: now,
          count: 3,
          userCount: 2,
        },
        now,
      ),
    ).toBe('State: New · First Seen: 1분 전 · 3건 · 사용자 2명 · EAR-API-1A');
    expect(
      formatIssueExtraLine(
        {
          shortId: null,
          state: 'regressed',
          firstSeen: new Date('2026-10-05T09:00:00Z'),
          lastSeen: null,
          count: null,
          userCount: null,
        },
        now,
      ),
    ).toBe('State: Regressed · First Seen: 2일 전');
    expect(
      formatIssueExtraLine(
        {
          shortId: null,
          state: null,
          firstSeen: null,
          lastSeen: null,
          count: null,
          userCount: null,
        },
        now,
      ),
    ).toBeNull();
  });

  it('formatSentryIssueText 는 extra 가 있으면 규칙 줄 다음에 끼운다', () => {
    const text = formatSentryIssueText(
      parseSentryWebhook(LEGACY_PAYLOAD)!,
      {
        shortId: 'EAR-APP-2',
        state: 'new',
        firstSeen: new Date('2026-10-07T08:30:00Z'),
        lastSeen: null,
        count: 1,
        userCount: 1,
      },
      now,
    );
    const lines = text.split('\n');
    expect(lines[4]).toBe('규칙: Send a notification for high priority issues');
    expect(lines[5]).toBe(
      'State: New · First Seen: 30분 전 · 1건 · 사용자 1명 · EAR-APP-2',
    );
  });
});
