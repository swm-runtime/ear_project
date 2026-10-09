import {
  serviceDateStart,
  shiftServiceDate,
  toServiceDate,
} from './service-date.util';


/**
 * 가입 체험(`subscription.md` 4.8 — 신규 가입자에게 일정 기간 무제한 청취)의 **시각 규칙을 이 파일에만 둔다.**
 *
 * 부여(user)·한도 판정(playback)·플랜 카드(subscription)가 같은 값을 읽는데, 세 모듈은 서로를 의존할 수
 * 없어(architecture.md 4.3) 규칙을 공용 유틸로 뺐다 — 각자 `now < ends_at`을 적으면 경계가 갈라진다.
 *
 * **체험은 서비스 날짜 단위다.** 재생 한도가 서비스 날짜(04:00 KST 경계)로 세어지므로, 체험이 한낮에 끝나면
 * 아침에 무제한으로 듣던 사용자가 오후에 "오늘 한도 초과"로 막힌다. 그래서 종료 시각을 04:00 경계에 맞춘다.
 */

/**
 * 가입 시각 → 체험 종료 시각(**배타 경계**).
 *
 * 가입한 서비스 날짜를 1일째로 세어 `days`일째의 서비스 날짜가 끝나는 경계(04:00 KST, 전환 뒤 05:00)다.
 * 10월 3일 15:00 가입·7일이면 10월 3일~9일이 체험이고 10월 10일 경계에 끝난다.
 *
 * **라벨을 옮긴 뒤 그 라벨의 시작 시각을 쓴다** — `시작 + days × 24h`로 더하면 경계 전환일(04:00 시작 → 다음 날 05:00,
 * 25시간)에 받은 체험이 D+days **04:00**에 끝나, 그 날 경계(05:00)까지 한 시간 동안 체험 중 재생이 한도에 잡힌다
 * (2026-10-09 전체 검증 — `paywall.md` 4.1 "체험은 경계에 끝난다"). 전환이 없는 날에는 두 계산이 같다.
 */
export function resolveSignupTrialEndsAt(signedUpAt: Date, days: number): Date {
  return serviceDateStart(shiftServiceDate(toServiceDate(signedUpAt), days));
}

/**
 * 체험 중인가. `trialEndsAt`이 없으면 체험을 받지 않은 계정이다.
 *
 * `undefined`도 "없음"으로 받는다 — 이 함수는 재생 판정 경로에 있고, 값이 빠진 사용자 객체(부분 조회·
 * 테스트 대역)가 들어왔다고 재생이 500으로 죽으면 안 된다. 없으면 체험이 아닌 쪽(더 엄격한 쪽)이다.
 */
export function isSignupTrialActive(
  trialEndsAt: Date | null | undefined,
  now: Date,
): trialEndsAt is Date {
  return (
    trialEndsAt !== null &&
    trialEndsAt !== undefined &&
    now.getTime() < trialEndsAt.getTime()
  );
}

/**
 * 체험으로 들을 수 있는 **마지막 서비스 날짜**(`YYYY-MM-DD`) — 안내 문구의 "N월 N일까지"가 이 값이다.
 *
 * 종료 시각은 그다음 날 04:00이라, 종료 시각을 그대로 날짜로 바꾸면 하루 뒤가 찍힌다. 클라이언트가
 * 04시 보정을 하지 않도록 서버가 라벨로 내려준다(CLAUDE.md 공통 원칙 — 서비스 날짜 판정은 서버).
 */
export function toSignupTrialLastFreeDate(trialEndsAt: Date): string {
  return toServiceDate(new Date(trialEndsAt.getTime() - 1));
}
