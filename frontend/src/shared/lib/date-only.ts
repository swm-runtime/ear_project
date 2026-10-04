/**
 * 시각이 없는 날짜 문자열(`YYYY-MM-DD`)을 월·일로 나눈다 — 표기 전용이다.
 *
 * `new Date('YYYY-MM-DD')`는 UTC 자정으로 파싱돼 UTC보다 서쪽 시간대 기기에서 하루 앞당겨진다.
 * 서버가 이미 판정해 준 날짜(예: 가입 체험의 마지막 무제한 날 `last_free_date`)를 그대로 그리려면
 * 시간대를 거치지 않고 문자열을 나눠야 한다. 날짜 연산(+1일 등)은 하지 않는다 — 경계 판정은 서버 몫이다.
 */
export const toDateOnlyMonthDay = (date: string): { month: number; day: number } => {
  const [, month, day] = date.split('-').map(Number);
  return { month, day };
};
