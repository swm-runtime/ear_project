import { resolveTracesSampleRate } from './sentry-options';

/**
 * `tracesSampleRate: 0` 은 "끔"이 아니라 "켜되 표본 0" 이다 — SDK 가 성능 계측을 전부 등록한다
 * (2026-09-23 개발계 실측, `sentry-options.ts` 주석). 끄려면 키가 없어야 한다.
 */
describe('resolveTracesSampleRate — 0 이면 키를 빼서 계측을 등록하지 않는다', () => {
  it('값이 없으면 undefined — 기본은 성능 추적 꺼짐', () => {
    expect(resolveTracesSampleRate(undefined)).toBeUndefined();
    expect(resolveTracesSampleRate('')).toBeUndefined();
    expect(resolveTracesSampleRate('  ')).toBeUndefined();
  });

  it('0 이면 undefined — 0 을 넘기면 SDK 가 스팬을 켠 것으로 본다', () => {
    expect(resolveTracesSampleRate('0')).toBeUndefined();
    expect(resolveTracesSampleRate('0.0')).toBeUndefined();
  });

  it('숫자가 아니거나 음수면 undefined — 잘못된 값으로 계측을 켜지 않는다', () => {
    expect(resolveTracesSampleRate('abc')).toBeUndefined();
    expect(resolveTracesSampleRate('-0.5')).toBeUndefined();
  });

  it('0 초과면 그 값 — 개발계에서 잠깐 올려 보는 경로', () => {
    expect(resolveTracesSampleRate('0.5')).toBe(0.5);
    expect(resolveTracesSampleRate('0.05')).toBe(0.05);
  });

  it('1 을 넘으면 1 로 자른다', () => {
    expect(resolveTracesSampleRate('3')).toBe(1);
  });
});
