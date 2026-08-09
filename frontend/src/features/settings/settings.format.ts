/**
 * 표기 판정 순수 함수 — 문구 조립은 settings.copy.ts가 하고, 여기는 상태·날짜 판정만 한다.
 * 테스트 러너 도입 시 그대로 단위 테스트 대상이 되도록 React 밖 순수 함수로 분리한다
 * (profile.format.ts와 같은 관례).
 */

/**
 * email × isEmailVerified → 세 상태(settings.md 4.1 — profile.md 4.3과 동일 구분).
 * profile.format.ts의 판정과 같은 규칙이다 — 두 화면이 같은 값을 다르게 가르면 안 된다.
 */
export const deriveEmailStatus = (
  email: string | null,
  isEmailVerified: boolean,
): 'unregistered' | 'unverified' | 'verified' => {
  if (email === null) return 'unregistered';
  return isEmailVerified ? 'verified' : 'unverified';
};

/** ISO UTC 시각 → 기기 로캘의 월·일. 판정은 서버 몫이고 표기만 클라이언트가 한다(profile-uiux.md 6장과 동일) */
export const toMonthDayParts = (iso: string): { month: number; day: number } => {
  const date = new Date(iso);
  return { month: date.getMonth() + 1, day: date.getDate() };
};
