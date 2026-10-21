import { UserMarket } from '../user.enum';
import { ConsentAudience } from '../user.types';

/** 법정대리인 동의 없이 혼자 동의할 수 있는 보수 기준 — KR 시장 정책값이자 GLOBAL의 기본값 */
export const DEFAULT_MIN_AGE = 18;

/** 본인 동의 연령이 16 이하인 나라의 GLOBAL 기준 연령 */
export const REDUCED_MIN_AGE = 16;

/**
 * GLOBAL에서 16세 기준을 쓰는 기기 지역(ISO 3166-1 alpha-2) — KAN-206 3안(2026-10-16 이주호 결정).
 * 싱가포르(본인 동의 13세)·홍콩(별도 연령 규정 없음)·한국(14세). 말레이시아·필리핀·인도네시아(18세 미만 법정대리인
 * 동의)와 태국(성년 20)은 넣지 않는다 — 목록에 없으면 18이다.
 */
const REDUCED_MIN_AGE_REGIONS: ReadonlySet<string> = new Set([
  'SG',
  'HK',
  'KR',
]);

/**
 * 연령 확인의 기준 연령(`global-api.md` 2.1, KAN-220) — **판정은 서버가 한다.** 앱은 받은 숫자를 문구에 끼우기만 한다.
 *
 * KR 시장은 지역과 무관하게 18이다. GLOBAL은 기기 지역(`region_code`)이 위 목록이면 16, 그 밖·모름은 18이다. 기기 지역은
 * GPS가 아니라 사용자가 바꿀 수 있는 값이라 "자기 선언" 수준의 근거다 — 모르면 보수값 18로 둔다.
 * 가입 전에는 요청의 `locale.region_code`, 가입 후에는 `users.region_code`(로그인마다 갱신)를 넣는다.
 */
export function minAgeFor(audience: ConsentAudience): number {
  if (audience.market !== UserMarket.GLOBAL) {
    return DEFAULT_MIN_AGE;
  }

  return audience.regionCode !== null &&
    REDUCED_MIN_AGE_REGIONS.has(audience.regionCode.toUpperCase())
    ? REDUCED_MIN_AGE
    : DEFAULT_MIN_AGE;
}

/**
 * 연령 확인 이력에 남길 버전 — **GLOBAL은 어느 기준 연령으로 확인받았는지** 남긴다(`age-16`·`age-18`).
 * 지역마다 확인 문구의 숫자가 달라, 이력에 숫자가 없으면 그 사용자가 무엇을 확인했는지 입증할 수 없다.
 *
 * KR은 null 그대로다 — KR 문구는 처음부터 18 하나였고, 값을 바꾸면 기존 KR 사용자 전원에게 재확인이 뜬다.
 */
export function ageConfirmationVersionFor(
  audience: ConsentAudience,
): string | null {
  return audience.market === UserMarket.GLOBAL
    ? `age-${minAgeFor(audience)}`
    : null;
}

/**
 * 이력의 버전이 확인해 준 기준 연령. null은 18로 본다 — KR 문구(만 18세)와 이 규칙 도입 전 이력이다.
 * **모르는 형식은 0으로 본다** — 확인받은 기준을 알 수 없으니 다시 묻는 쪽이다. 확인 문구를 개정해 버전 형식이
 * 바뀌면(예: `age-16-v2`) 옛 이력이 조용히 "확인됨"으로 남지 않고 재확인이 뜬다.
 */
export function confirmedMinAgeOf(version: string | null): number {
  if (version === null) {
    return DEFAULT_MIN_AGE;
  }
  const matched = /^age-(\d+)$/.exec(version);

  return matched === null ? 0 : Number(matched[1]);
}
