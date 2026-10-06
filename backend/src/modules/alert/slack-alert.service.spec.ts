import {
  resolveWebhookUrl,
  withEnvironmentPrefix,
} from './slack-alert.service';

/** 웹훅 선택 — 기본은 기존 알림 채널이다(채널을 새로 만들지 않는다) */
describe('resolveWebhookUrl', () => {
  it('전용 웹훅이 있으면 그것을 쓴다', () => {
    expect(resolveWebhookUrl('https://signup', 'https://error')).toBe(
      'https://signup',
    );
  });

  it('전용 웹훅이 없으면 기존 알림 채널로 보낸다 — env 를 안 건드려도 켜진다', () => {
    expect(resolveWebhookUrl(undefined, 'https://error')).toBe('https://error');
    expect(resolveWebhookUrl('', 'https://error')).toBe('https://error');
  });

  it('공백만 있는 값은 없는 것으로 본다 — env 를 지우는 대신 비워 두는 일이 흔하다', () => {
    expect(resolveWebhookUrl('   ', 'https://error')).toBe('https://error');
    expect(resolveWebhookUrl('   ', '  ')).toBe('');
  });

  it('둘 다 없으면 꺼진다', () => {
    expect(resolveWebhookUrl()).toBe('');
  });
});

describe('withEnvironmentPrefix', () => {
  it('운영이 아니면 환경을 앞에 붙인다 — 같은 웹훅을 개발계에 넣어도 섞이지 않는다', () => {
    expect(withEnvironmentPrefix(':wave: 가입', 'development')).toBe(
      '[development] :wave: 가입',
    );
  });

  it('운영에는 아무 표시도 붙지 않는다 — 대부분의 줄이 운영이라 없는 쪽이 기본이어야 읽힌다', () => {
    expect(withEnvironmentPrefix(':wave: 가입', 'production')).toBe(
      ':wave: 가입',
    );
    expect(withEnvironmentPrefix(':wave: 가입', '')).toBe(':wave: 가입');
    expect(withEnvironmentPrefix(':wave: 가입')).toBe(':wave: 가입');
  });
});
