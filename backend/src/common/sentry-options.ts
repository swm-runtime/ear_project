/**
 * `SENTRY_TRACES_SAMPLE_RATE` → `tracesSampleRate` 옵션 값.
 *
 * **0 을 그대로 넘기면 안 된다.** Sentry Node SDK 는 `tracesSampleRate != null` 이면
 * "스팬 켜짐"으로 보고(`@sentry/core` `hasSpansEnabled`) express·nest·pg 성능 계측과
 * diagnostics-channel 주입을 전부 등록한다 — 표본만 0 이라 **아무것도 보내지 않으면서 비용은
 * 다 낸다.** 2026-09-23 개발계 실측: 온보딩 가입 분당 600명에서 API CPU 45~55% → 70~93%.
 *
 * 그래서 값이 없거나 0 이면 **키 자체를 빼서**(undefined) 계측이 등록되지 않게 한다.
 */
export function resolveTracesSampleRate(
  raw: string | undefined,
): number | undefined {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return undefined;
  }

  const rate = Number(trimmed);

  if (!Number.isFinite(rate) || rate <= 0) {
    return undefined;
  }

  return Math.min(rate, 1);
}
